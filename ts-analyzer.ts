// TS传输流分析器 - TypeScript版本
import { parseAVS1VideoDescriptor, parseAVS2VideoDescriptor, parseAVS3VideoDescriptor, parseAVS3AudioDescriptor } from './avs-descriptor-parser.js';
import { 
    AVSVideoInfo, 
    AVSAudioInfo,
    AVSVideoDescriptor, 
    AVSAudioDescriptor,
    formatBitRate, 
    AVSVideoDescriptorToDisplayItems,
    AVSAudioDescriptorToDisplayItems,
    AVSVideoInfoToCopyFormat,
    AVSAudioInfoToCopyFormat,
    AVSVideoInfoToDisplayItems,
    AVSAudioInfoToDisplayItems
} from './avs-info.js';

interface StreamInfo {
    streamType: number;
    pid: number;
    codecInfo: {
        name: string;
        type: string;
    };
    language: string;
    description: string[];
    avsDetails?: AVSVideoInfo | AVSAudioInfo; // AVS原始详情
    avsDescriptor?: AVSVideoDescriptor | AVSAudioDescriptor; // AVS视频描述符
    formatIdentifier?: string; // Registration descriptor fourCC
}

interface ProgramInfo {
    pmtPid: number;
    streams: Map<number, StreamInfo>;
}

// 新增：PES包重组状态
interface PESReassemblyState {
    currentPES: Uint8Array | null;  // 当前正在重组的PES包数据
    isCollecting: boolean;          // 是否正在收集PES包
    completedPES: Uint8Array[];     // 已完成的完整PES包列表
}


export class TSAnalyzer {
    private packetSize: number = 188;
    private syncByte: number = 0x47;
    private programs: Map<number, ProgramInfo> = new Map();
    private streams: Map<number, StreamInfo> = new Map();
    private packetCount: number = 0;
    private pesReassembly: Map<number, PESReassemblyState> = new Map(); // PES包重组状态
    private actualProcessedPackets?: number;
    private isPartialParse: boolean = false;
    private avsAnalyzer: any; // AVS分析器实例
    private avs2Analyzer: any; // AVS2分析器实例
    private avs3Analyzer: any; // AVS3分析器实例
    private av3aAnalyzer: any; // AV3A分析器实例
    private patCount: number = 0; // PAT表遇到次数
    private pmtCount: number = 0; // PMT表遇到次数
    private detectionPids: Set<number> = new Set(); // 需要进一步检测的PID列表
    private detectionResults: Map<number, AVSVideoInfo | AVSAudioInfo> = new Map(); // 检测结果存储
    private patParsed: boolean = false;
    private unparsedPmtPids: Set<number> = new Set();
    private allPmtsParsed: boolean = false;
    private pmtPids: Set<number> = new Set();
    private initializingPromises: Map<number, Promise<void>> = new Map(); // 维护每个streamType的初始化Promise

    constructor() {
        // 不自动初始化事件监听器，由外部控制
    }

    // 初始化事件监听器
    private initializeEventListeners(): void {
        const fileInput = document.getElementById('fileInput') as HTMLInputElement;
        const uploadArea = document.getElementById('uploadArea') as HTMLElement;

        // 文件选择
        fileInput.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            if (target.files && target.files.length > 0) {
                this.handleFile(target.files[0]);
                target.value = '';
            }
        });

        // 拖拽上传
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
                this.handleFile(e.dataTransfer.files[0]);
            }
        });

        // 点击上传区域
        uploadArea.addEventListener('click', () => {
            fileInput.click();
        });
    }

    // 处理文件
    public async handleFile(file: File): Promise<void> {
        this.showFileInfo(file);
        this.showAnalysisSection();

        try {
            const isLargeFile = file.size > 22000 * 188;

            if (isLargeFile) {
                const partialBuffer = await this.readPartialFile(file, 0, 22000 * 188);
                await this.parseTS(partialBuffer, true);
                this.showResults(file, true);
            } else {
                const arrayBuffer = await this.readFileAsArrayBuffer(file);
                await this.parseTS(arrayBuffer, false);
                this.showResults(file, false);
            }
        } catch (error) {
            console.error('解析错误:', error);
            this.showError('文件解析失败: ' + (error as Error).message);
        }
    }

    // 显示文件信息
    private showFileInfo(file: File): void {
        const fileInfo = document.getElementById('fileInfo') as HTMLElement;
        const fileName = document.getElementById('fileName') as HTMLElement;
        const fileSize = document.getElementById('fileSize') as HTMLElement;

        fileName.textContent = file.name;
        fileSize.textContent = this.formatFileSize(file.size);
        fileInfo.style.display = 'flex';
    }

    // 显示分析区域
    private showAnalysisSection(): void {
        const analysisSection = document.getElementById('analysisSection') as HTMLElement;
        const resultsSection = document.getElementById('resultsSection') as HTMLElement;

        analysisSection.style.display = 'block';
        resultsSection.style.display = 'none';

        this.updateProgress(0);
    }

    // 更新进度
    private updateProgress(percent: number): void {
        const progressBar = document.getElementById('progressBar') as HTMLElement;
        progressBar.style.width = percent + '%';
    }

    // 读取文件为ArrayBuffer
    private readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as ArrayBuffer);
            reader.onerror = () => reject(reader.error);
            reader.readAsArrayBuffer(file);
        });
    }

    // 读取文件的部分内容
    private readPartialFile(file: File, start: number, length: number): Promise<ArrayBuffer> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as ArrayBuffer);
            reader.onerror = () => reject(reader.error);

            const endPos = Math.min(start + length, file.size);
            const blob = file.slice(start, endPos);
            reader.readAsArrayBuffer(blob);
        });
    }

    // 新增：自动检测TS包大小和起始偏移
    private detectPacketProperties(data: Uint8Array): { size: number; startOffset: number } {
        const SYNC_BYTE = 0x47;
        const PROBE_COUNT = 20; // 连续检测多少个包来确认

        let firstSync = -1;
        // 查找第一个同步字节，但要考虑M2TS的4字节头
        for (let i = 0; i < data.length - 188; i++) {
            if (data[i] === SYNC_BYTE) {
                firstSync = i;
                break;
            }
        }

        if (firstSync === -1) {
            console.warn("在文件中未找到同步字节 (0x47)。假定为188字节包，从文件头开始。");
            return { size: 188, startOffset: 0 };
        }

        // 1. 优先检测192字节包 (M2TS)
        // M2TS包的同步字节在第4个字节之后，所以包的起始位置是 firstSync - 4
        const m2tsStart = firstSync - 4;
        if (m2tsStart >= 0 && data.length >= m2tsStart + 192 * PROBE_COUNT) {
            let is192 = true;
            for (let i = 0; i < PROBE_COUNT; i++) {
                if (data[m2tsStart + (i * 192) + 4] !== SYNC_BYTE) {
                    is192 = false;
                    break;
                }
            }
            if (is192) {
                console.log(`✅ 检测到M2TS格式 (192字节/包)，数据从偏移量 ${m2tsStart} 开始。`);
                return { size: 192, startOffset: m2tsStart };
            }
        }

        // 2. 检测188字节包 (标准TS)
        // 标准TS包的同步字节在包的开头
        if (data.length >= firstSync + 188 * PROBE_COUNT) {
            let is188 = true;
            for (let i = 1; i < PROBE_COUNT; i++) { //从第二个包开始检查
                if (data[firstSync + (i * 188)] !== SYNC_BYTE) {
                    is188 = false;
                    break;
                }
            }
            if (is188) {
                console.log(`✅ 检测到标准TS格式 (188字节/包)，数据从偏移量 ${firstSync} 开始。`);
                return { size: 188, startOffset: firstSync };
            }
        }
        
        console.warn("无法确定包大小，将从找到的第一个同步字节开始，按188字节/包处理。");
        return { size: 188, startOffset: firstSync };
    }

    // 解析TS文件
    private async parseTS(arrayBuffer: ArrayBuffer, isPartialParse: boolean = false): Promise<void> {
        const data = new Uint8Array(arrayBuffer);

        // 新增: 自动检测包大小和起始偏移
        const { size: detectedPacketSize, startOffset } = this.detectPacketProperties(data);
        this.packetSize = detectedPacketSize;
        
        const totalPackets = Math.floor((data.length - startOffset) / this.packetSize);

        this.packetCount = totalPackets;
        this.isPartialParse = isPartialParse;
        this.programs.clear();
        this.streams.clear();
        this.pesReassembly.clear(); // 清空PES重组状态
        this.detectionPids.clear(); // 清空待检测PID列表
        this.detectionResults.clear(); // 清空检测结果
        this.patCount = 0;
        this.pmtCount = 0;

        let processedPackets = 0;

        for (let i = startOffset; i < data.length; i += this.packetSize) {
            if (i + this.packetSize > data.length) break;

            let packet: Uint8Array;

            // 根据包大小提取标准的188字节TS包
            if (this.packetSize === 192) {
                // M2TS: 跳过4字节头部
                packet = data.slice(i + 4, i + 192);
            } else {
                // 标准TS
                packet = data.slice(i, i + this.packetSize);
            }

            if (packet.length < 188 || packet[0] !== this.syncByte) {
                console.warn(`包 ${processedPackets} 在偏移量 ${i} 处同步字节错误`);
                continue;
            }

            this.parsePacket(packet);
            processedPackets++;

            if (isPartialParse && processedPackets > 20000) {
                if (this.programs.size > 0 && this.streams.size > 0) {
                    console.log(`快速解析完成: 处理了 ${processedPackets} 个包`);
                    break;
                }
            }

            // 优化：当所有PMT都已解析且没有待检测的AVS流时，提前退出
            if (this.allPmtsParsed && this.detectionPids.size === 0) {
                console.log(`🚀 解析优化: 所有PMT已解析且无待检测AVS流，提前退出循环 (处理了 ${processedPackets} 个包)`);
                break;
            }

            // 更频繁地更新进度，不再有延时
            if (processedPackets % 1000 === 0) {
                this.updateProgress((processedPackets / totalPackets) * 100);
            }
        }

        this.updateProgress(100);

        if (isPartialParse) {
            this.actualProcessedPackets = processedPackets;
        }

        // 输出解析统计信息
        console.log(`📊 解析统计: PAT表遇到${this.patCount}次, PMT表遇到${this.pmtCount}次, 发现${this.programs.size}个程序, ${this.streams.size}个流`);



        // 等待所有分析器初始化完成
        await this.waitForAnalyzers();
        
        // 完成PES包重组
        this.finalizePESReassembly();

        // 应用实时检测的AVS结果
        await this.applyAVSDetectionResults();
    }

    // 解析单个TS包
    private parsePacket(packet: Uint8Array): void {
        const header = this.parseTSHeader(packet);

        if (!header) return;

        if (header.hasPayload) {
            const payloadStart = header.payloadStart;
            const payload = packet.slice(payloadStart);

            // 处理PES包重组
            this.handlePESReassembly(header.pid, payload, header.payloadUnitStartIndicator);

            if (header.payloadUnitStartIndicator && payload.length > 0) {
                this.parsePSI(header.pid, payload);
            }
        }
    }

    // 处理PES包重组
    private handlePESReassembly(pid: number, payload: Uint8Array, payloadUnitStartIndicator: boolean): void {
        // 1. 跳过已知的系统PID和所有从PAT中发现的PMT PID
        if (pid === 0x0000 || pid === 0x0001 || pid === 0x0010 || pid === 0x0011 || pid === 0x1FFF || this.pmtPids.has(pid)) {
            return;
        }

        // 2. 只有在所有PMT都解析完毕后，才启用优化，跳过非目标视频流
        if (this.allPmtsParsed && !this.detectionPids.has(pid)) {
            return;
        }

        // 初始化PES重组状态
        if (!this.pesReassembly.has(pid)) {
            this.pesReassembly.set(pid, {
                currentPES: null,
                isCollecting: false,
                completedPES: []
            });
        }

        const state = this.pesReassembly.get(pid)!;

        if (payloadUnitStartIndicator) {
            // PUSI=1: 新PES包开始

            // 如果之前有未完成的PES包，先推入并检测
            if (state.currentPES && state.isCollecting) {
                this.pushPESAndDetect(pid);
            }

            // 开始新的PES包收集
            state.currentPES = new Uint8Array(payload);
            state.isCollecting = true;
        } else {
            // PUSI=0: 继续当前PES包
            if (state.isCollecting && state.currentPES) {
                // 将新数据追加到当前PES包
                const newSize = state.currentPES.length + payload.length;
                const newPES = new Uint8Array(newSize);
                newPES.set(state.currentPES);
                newPES.set(payload, state.currentPES.length);
                state.currentPES = newPES;
            }
        }
    }

    // 封装推入currentPES并检测的过程
    private pushPESAndDetect(pid: number): void {
        const state = this.pesReassembly.get(pid);
        if (!state || !state.currentPES || !state.isCollecting) {
            return;
        }

        // 1. 先推入currentPES到completedPES
        state.completedPES.push(state.currentPES);

        // 2. 如果PID需要检测，遍历检测所有completedPES
        if (this.detectionPids.has(pid) && !this.detectionResults.has(pid)) {
            this.detectAllCompletedPES(pid);
        }
    }

    // 初始化分析器（用于PMT解析时）
    private initAnalyzerIfNeeded(streamType: number): void {
        // 检查分析器是否已存在
        if (this.getAnalyzer(streamType)) {
            return;
        }

        // 如果正在初始化，跳过（避免重复）
        if (this.initializingPromises.has(streamType)) {
            return;
        }

        // 开始初始化
        let initPromise: Promise<void>;
        
        switch (streamType) {
            case 0x42: // AVS1
                initPromise = import('./avs-analyzer.js').then(module => {
                    this.avsAnalyzer = new module.AVS1Analyzer();
                    console.log('⚡ AVS分析器已初始化 (PMT时)');
                });
                break;
            case 0xd2: // AVS2
                initPromise = import('./avs2-analyzer.js').then(module => {
                    this.avs2Analyzer = new module.AVS2Analyzer();
                    console.log('⚡ AVS2分析器已初始化 (PMT时)');
                });
                break;
            case 0xd4: // AVS3
                initPromise = import('./avs3-analyzer.js').then(module => {
                    this.avs3Analyzer = new module.AVS3Analyzer();
                    console.log('⚡ AVS3分析器已初始化 (PMT时)');
                });
                break;
            case 0xd5: // Audio Vivid
                initPromise = import('./av3a-analyzer.js').then(module => {
                    this.av3aAnalyzer = new module.AV3AAnalyzer();
                    console.log('⚡ Audio Vivid分析器已初始化 (PMT时)');
                });
                break;
            default:
                return; // 不支持的流类型
        }

        initPromise = initPromise.catch(error => {
            console.error(`分析器初始化失败 (streamType: 0x${streamType.toString(16)}):`, error);
        }).finally(() => {
            // 完成后从Map中移除
            this.initializingPromises.delete(streamType);
        });

        this.initializingPromises.set(streamType, initPromise);
    }

    // 获取已初始化的分析器
    private getAnalyzer(streamType: number): { analyzer: any; type: string } | null {
        switch (streamType) {
            case 0x42: // AVS1
                return this.avsAnalyzer ? { analyzer: this.avsAnalyzer, type: 'AVS' } : null;
            case 0xd2: // AVS2
                return this.avs2Analyzer ? { analyzer: this.avs2Analyzer, type: 'AVS2' } : null;
            case 0xd4: // AVS3
                return this.avs3Analyzer ? { analyzer: this.avs3Analyzer, type: 'AVS3' } : null;
            case 0xd5: // Audio Vivid
                return this.av3aAnalyzer ? { analyzer: this.av3aAnalyzer, type: 'Audio Vivid' } : null;
            default:
                return null;
        }
    }

    // 等待所有分析器初始化完成
    private async waitForAnalyzers(): Promise<void> {
        if (this.initializingPromises.size === 0) {
            return;
        }
        
        console.log(`⏳ 等待 ${this.initializingPromises.size} 个分析器初始化完成...`);
        await Promise.all(this.initializingPromises.values());
        console.log(`✅ 所有分析器初始化完成`);
    }

    // 执行AVS检测的核心逻辑
    private performAVSDetection(pid: number, state: PESReassemblyState, analyzer: any, type: string): void {
        try {
            // 遍历检测所有已完成的PES包
            for (const completedPES of state.completedPES) {
                const esData = this.extractESFromPES(completedPES);
                if (esData.length > 0) {
                    const header = analyzer.analyze(esData);

                    if (header) {
                        // 找到有效序列头，保存结果
                        this.detectionResults.set(pid, header);

                        // 从待检测列表中移除
                        this.detectionPids.delete(pid);

                        console.log(`⚡ 实时检测成功: PID 0x${pid.toString(16).toUpperCase().padStart(4, '0')} 找到${type}序列头`);
                        console.log(`🎯 剩余待检测PID: ${this.detectionPids.size} 个`);
                        break; // 检测成功，提前退出循环
                    }
                }
            }
        } catch (error) {
            console.warn(`检测失败 PID 0x${pid.toString(16).toUpperCase().padStart(4, '0')}:`, error);
        } finally {
            // 无论检测是否成功，都清空completedPES数组释放内存
            state.completedPES.splice(0);
        }
    }

    // 检测所有completedPES包
    private detectAllCompletedPES(pid: number): void {
        // 1. 基础检查
        const state = this.pesReassembly.get(pid);
        if (!state || state.completedPES.length === 0) {
            return;
        }

        const stream = this.streams.get(pid);
        if (!stream || !this.isAVSStream(stream.streamType)) {
            return;
        }

        // 2. 获取已初始化的分析器
        const result = this.getAnalyzer(stream.streamType);
        if (!result) {
            return; // 分析器未初始化，跳过检测
        }

        // 3. 直接执行检测
        this.performAVSDetection(pid, state, result.analyzer, result.type);
    }

    // 完成PES包重组
    private finalizePESReassembly(): void {
        let totalPESPackets = 0;
        let pesStreams = 0;

        for (const [pid, state] of this.pesReassembly) {
            // 将最后一个未完成的PES包也推入并检测
            if (state.currentPES && state.isCollecting) {
                this.pushPESAndDetect(pid);
                state.currentPES = null;
                state.isCollecting = false;
            }

            // 统计PES包信息
            if (state.completedPES.length > 0) {
                totalPESPackets += state.completedPES.length;
                pesStreams++;

                // 计算PES包的总大小
                const totalSize = state.completedPES.reduce((sum, pes) => sum + pes.length, 0);
                console.log(`🔄 PID 0x${pid.toString(16).toUpperCase().padStart(4, '0')}: 重组完成 ${state.completedPES.length} 个PES包, 总大小: ${totalSize} 字节`);
            }
        }

        console.log(`📦 PES重组完成: ${pesStreams} 个流, 总计 ${totalPESPackets} 个完整PES包`);

        // 输出剩余检测状态
        if (this.detectionPids.size > 0) {
            console.log(`⚠️ 仍有 ${this.detectionPids.size} 个AVS流未检测到序列头`);
        } else {
            console.log(`✅ 所有AVS流都已成功检测`);
        }
    }

    // 解析PES头部，提取ES数据
    private extractESFromPES(pesData: Uint8Array): Uint8Array {
        if (pesData.length < 6) {
            return new Uint8Array(0);
        }

        // 检查PES开始码 0x000001
        if (pesData[0] === 0x00 && pesData[1] === 0x00 && pesData[2] === 0x01) {
            // 这是一个PES包的开始
            const streamId = pesData[3];
            const pesPacketLength = (pesData[4] << 8) | pesData[5];

            if (pesData.length < 9) {
                return pesData.slice(6);
            }

            // 对于视频流，解析完整的PES头部
            if ((streamId >= 0xE0 && streamId <= 0xEF) || // MPEG视频流
                (streamId >= 0xC0 && streamId <= 0xDF)) { // MPEG音频流

                // 检查PES头部标志
                const pesFlags1 = pesData[6]; // 应该是 0x80
                const pesFlags2 = pesData[7]; // PTS/DTS标志等
                const pesHeaderDataLength = pesData[8];

                const esDataStart = 9 + pesHeaderDataLength;

                if (esDataStart < pesData.length) {
                    const esData = pesData.slice(esDataStart);
                    return esData;
                }
            }

            // 其他情况，跳过基本PES头部
            return pesData.slice(6);
        }

        // 如果不是PES包开始，可能是继续数据，直接返回
        return pesData;
    }

    // 检查是否为AVS流
    private isAVSStream(streamType: number): boolean {
        return streamType === 0x42 || streamType === 0xd2 || streamType === 0xd4 || streamType === 0xd5;
    }

    private isAVSVideoStream(streamType: number): boolean {
        return streamType === 0x42 || streamType === 0xd2 || streamType === 0xd4;
    }

    private isAVSAudioStream(streamType: number): boolean {
        return streamType === 0xd5;
    }

    // 检查节目是否包含AVSV视频流（可被mediainfo解析的AVS视频）
    private hasAVSVVideo(program: ProgramInfo): boolean {
        return Array.from(program.streams.values()).some(stream => 
            stream.formatIdentifier === 'AVSV' && stream.avsDetails && this.isAVSVideoStream(stream.streamType)
        );
    }

    // 检查节目是否有非AVSV的可复制内容
    private hasNonAVSVContent(program: ProgramInfo): boolean {
        return Array.from(program.streams.values()).some(stream => 
            stream.avsDetails && stream.formatIdentifier !== 'AVSV'
        );
    }



    // 十六进制打印辅助函数
    private printHexBytes(data: Uint8Array, offset: number = 0, length: number = 32, label: string = ""): void {
        const slice = data.slice(offset, offset + length);
        const hexString = Array.from(slice)
            .map(byte => byte.toString(16).padStart(2, '0').toUpperCase())
            .join(' ');
        console.log(`${label}[${offset}-${offset + slice.length - 1}]: ${hexString}`);
    }



    // 应用实时检测的AVS分析结果
    private async applyAVSDetectionResults(): Promise<void> {
        console.log(`应用实时AVS检测结果，共有 ${this.detectionResults.size} 个检测结果`);

        if (this.detectionResults.size === 0) {
            console.log('没有找到AVS检测结果');
            return;
        }

        for (const [pid, header] of this.detectionResults) {
            const stream = this.streams.get(pid);
            if (stream && this.isAVSStream(stream.streamType)) {
                // 直接存储原始的AVS信息
                stream.avsDetails = header;
                console.log(`✅ 应用实时检测结果 PID 0x${pid.toString(16).toUpperCase().padStart(4, '0')} AVS详情:`, stream.avsDetails);
            }
        }

        console.log(`📊 AVS检测结果应用完成，成功应用 ${this.detectionResults.size} 个结果`);
    }

    // 解析TS头部
    private parseTSHeader(packet: Uint8Array): any {
        if (packet.length < 4) return null;

        const header = {
            syncByte: packet[0],
            transportErrorIndicator: (packet[1] & 0x80) !== 0,
            payloadUnitStartIndicator: (packet[1] & 0x40) !== 0,
            transportPriority: (packet[1] & 0x20) !== 0,
            pid: ((packet[1] & 0x1F) << 8) | packet[2],
            scramblingControl: (packet[3] & 0xC0) >> 6,
            adaptationFieldControl: (packet[3] & 0x30) >> 4,
            continuityCounter: packet[3] & 0x0F,
            hasPayload: false,
            payloadStart: 4
        };

        header.hasPayload = (header.adaptationFieldControl & 0x01) !== 0;

        if ((header.adaptationFieldControl & 0x02) !== 0) {
            if (packet.length > 4) {
                const adaptationFieldLength = packet[4];
                header.payloadStart = 5 + adaptationFieldLength;
            }
        }

        return header;
    }

    // 解析PSI
    private parsePSI(pid: number, payload: Uint8Array): void {
        if (payload.length < 1) return;

        const pointerField = payload[0];
        let offset = 1 + pointerField;

        if (offset >= payload.length) return;

        const tableId = payload[offset];

        if (offset + 3 >= payload.length) return;

        const sectionLength = ((payload[offset + 1] & 0x0F) << 8) | payload[offset + 2];

        if (offset + 3 + sectionLength > payload.length) return;

        switch (tableId) {
            case 0x00:
                this.patCount++;
                this.parsePAT(payload.slice(offset));
                break;
            case 0x02:
                this.pmtCount++;
                // 只有成功解析了新的PMT，才更新状态
                if (this.parsePMT(payload.slice(offset), pid)) {
                    this.unparsedPmtPids.delete(pid);
                    if (this.patParsed && this.unparsedPmtPids.size === 0 && !this.allPmtsParsed) {
                        this.allPmtsParsed = true;
                        console.log('✅ 所有PMT表均已解析，PES处理将切换到优化模式。');
                    }
                }
                break;
        }
    }

    // 解析PAT表
    private parsePAT(data: Uint8Array): void {
        if (data.length < 8) return;

        const sectionLength = ((data[1] & 0x0F) << 8) | data[2];

        let offset = 8;
        const endOffset = 3 + sectionLength - 4;

        while (offset + 3 < endOffset) {
            const programNumber = (data[offset] << 8) | data[offset + 1];
            const pid = ((data[offset + 2] & 0x1F) << 8) | data[offset + 3];

            if (programNumber !== 0) {
                if (!this.programs.has(programNumber)) {
                    this.programs.set(programNumber, { pmtPid: pid, streams: new Map() });
                    this.unparsedPmtPids.add(pid);
                    this.pmtPids.add(pid);
                    console.log(`✅ 发现程序 ${programNumber}, PMT PID: 0x${pid.toString(16).toUpperCase().padStart(4, '0')}`);
                }
            }

            offset += 4;
        }

        this.patParsed = true;
    }

    // 解析PMT表
    private parsePMT(data: Uint8Array, pid: number): boolean {
        if (data.length < 12) return false;

        const sectionLength = ((data[1] & 0x0F) << 8) | data[2];
        const programNumber = (data[3] << 8) | data[4];
        const programInfoLength = ((data[10] & 0x0F) << 8) | data[11];

        // 检查是否已经解析过这个程序的PMT
        const existingProgram = this.programs.get(programNumber);
        if (existingProgram && existingProgram.streams.size > 0) {
            if (this.pmtCount % 100 === 1) { // 每100次显示一次重复提醒
                console.log(`🔄 PMT表重复遇到 (程序 ${programNumber}, PID 0x${pid.toString(16).toUpperCase()}), 跳过`);
            }
            return false;
        }

        let offset = 12 + programInfoLength;
        const endOffset = 3 + sectionLength - 4;

        const program = this.programs.get(programNumber);
        if (!program) return false;

        while (offset + 4 < endOffset) {
            const streamType = data[offset];
            const elemPid = ((data[offset + 1] & 0x1F) << 8) | data[offset + 2];
            const esInfoLength = ((data[offset + 3] & 0x0F) << 8) | data[offset + 4];

            const streamInfo: StreamInfo = {
                streamType: streamType,
                pid: elemPid,
                codecInfo: this.getCodecInfo(streamType),
                language: '',
                description: []
            };

            // 解析descriptor部分
            if (esInfoLength > 0 && offset + 5 + esInfoLength <= endOffset) {
                const descriptorData = data.slice(offset + 5, offset + 5 + esInfoLength);
                this.parseDescriptors(descriptorData, streamInfo);
            }

            // 如果是AVS流，加入待检测列表并立即初始化分析器
            if (this.isAVSStream(streamType)) {
                this.detectionPids.add(elemPid);
                console.log(`🎯 添加AVS流到待检测列表: PID 0x${elemPid.toString(16).toUpperCase().padStart(4, '0')}, 类型: 0x${streamType.toString(16)}`);
                
                // 立即初始化对应的分析器
                this.initAnalyzerIfNeeded(streamType);
            }

            this.streams.set(elemPid, streamInfo);
            program.streams.set(elemPid, streamInfo);

            console.log(`📺 发现流 (节目 ${programNumber}): PID 0x${elemPid.toString(16).toUpperCase().padStart(4, '0')}, 类型: ${this.getCodecInfo(streamType).name}`);

            offset += 5 + esInfoLength;
        }

        return true;
    }

    // 解析descriptor
    private parseDescriptors(descriptorData: Uint8Array, streamInfo: StreamInfo): void {
        let offset = 0;

        while (offset + 1 < descriptorData.length) {
            const descriptorTag = descriptorData[offset];
            const descriptorLength = descriptorData[offset + 1];

            if (offset + 2 + descriptorLength > descriptorData.length) {
                break;
            }

            const descriptorPayload = descriptorData.slice(offset + 2, offset + 2 + descriptorLength);

            switch (descriptorTag) {
                case 0x05: // Registration descriptor
                    if (descriptorLength >= 4) {
                        const fourCC = String.fromCharCode(
                            descriptorPayload[0],
                            descriptorPayload[1],
                            descriptorPayload[2],
                            descriptorPayload[3]
                        );
                        streamInfo.formatIdentifier = fourCC;
                    }
                    break;
                case 0x0A: // ISO 639 language descriptor
                    if (descriptorLength >= 4) {
                        const languageCode = String.fromCharCode(
                            descriptorPayload[0],
                            descriptorPayload[1],
                            descriptorPayload[2]
                        );
                        streamInfo.language = languageCode;
                    }
                    break;

                case 0x0E: // Maximum bitrate descriptor
                    if (descriptorLength >= 3) {
                        const maxBitrate = ((descriptorPayload[0] & 0x3F) << 16) | (descriptorPayload[1] << 8) | descriptorPayload[2];
                        streamInfo.description.push(`Max bitrate: ${formatBitRate(maxBitrate * 400)}`);
                    }
                    break;

                case 0x2A: // AVC Video descriptor
                    streamInfo.description.push('H.264/AVC');
                    break;

                case 0x38: // HEVC Video descriptor
                    streamInfo.description.push('H.265/HEVC');
                    break;

                case 0x50: // Component descriptor
                    if (descriptorLength >= 4) {
                        const componentType = descriptorPayload[0];
                        const componentTag = descriptorPayload[1];
                        const languageCode = String.fromCharCode(
                            descriptorPayload[2],
                            descriptorPayload[3],
                            descriptorPayload[4]
                        );
                        streamInfo.language = languageCode;
                        streamInfo.description.push(`Component type: 0x${componentType.toString(16).padStart(2, '0')}`);
                    }
                    break;

                case 0x3F: // AVS video descriptor
                    if (streamInfo.streamType === 0x42) { // AVS1
                        const avsDescriptor = parseAVS1VideoDescriptor(descriptorPayload);
                        if (avsDescriptor) {
                            streamInfo.avsDescriptor = avsDescriptor;
                        }
                    }
                    break;
                    
                case 0x40: // AVS2 video descriptor
                    if (streamInfo.streamType === 0xD2) { // AVS2
                        const avsDescriptor = parseAVS2VideoDescriptor(descriptorPayload);
                        if (avsDescriptor) {
                            streamInfo.avsDescriptor = avsDescriptor;
                        }
                    }
                    break;

                case 0xD1: // AVS3 video descriptor
                    if (streamInfo.streamType === 0xD4) { // AVS3
                        const avsDescriptor = parseAVS3VideoDescriptor(descriptorPayload);
                        if (avsDescriptor) {
                            streamInfo.avsDescriptor = avsDescriptor;
                        }
                    }
                    break;

                case 0xD2: // AVS3 audio descriptor
                    if (streamInfo.streamType === 0xD5) { // Audio Vivid
                        const avsDescriptor = parseAVS3AudioDescriptor(descriptorPayload);
                        if (avsDescriptor) {
                            streamInfo.avsDescriptor = avsDescriptor;
                        }
                    }
                    break;

                case 0x52: // Stream identifier descriptor
                    if (descriptorLength >= 1) {
                        const componentTag = descriptorPayload[0];
                        streamInfo.description.push(`Component tag: 0x${componentTag.toString(16).padStart(2, '0')}`);
                    }
                    break;
                    
                case 0x56: // EBU Teletext descriptor
                    streamInfo.description.push('EBU Teletext');
                    break;

                case 0x59: // Subtitling descriptor
                    if (descriptorLength >= 8) {
                        const languageCode = String.fromCharCode(
                            descriptorPayload[0],
                            descriptorPayload[1],
                            descriptorPayload[2]
                        );
                        streamInfo.language = languageCode;
                        streamInfo.description.push('DVB Subtitles');
                    }
                    break;

                case 0x6A: // AC-3 descriptor
                    streamInfo.codecInfo = { name: 'AC-3', type: 'Audio' };
                    break;

                case 0x7A: // Enhanced AC-3 descriptor
                    streamInfo.codecInfo = { name: 'E-AC-3', type: 'Audio' };
                    break;

                case 0x7B: // DTS descriptor
                    streamInfo.codecInfo = { name: 'DTS', type: 'Audio' };
                    break;

                case 0x81: // AC-3 audio descriptor (ATSC)
                    streamInfo.codecInfo = { name: 'AC-3', type: 'Audio' };
                    break;

                case 0x84: // SCTE-35 descriptor
                    streamInfo.description.push('SCTE-35 Cue');
                    break;

                case 0x86: // Caption service descriptor
                    streamInfo.description.push('Caption Service');
                    break;

                case 0x88: // AAC audio descriptor
                    streamInfo.codecInfo = { name: 'AAC', type: 'Audio' };
                    break;

                case 0xCC: // Enhanced AC-3 descriptor (ATSC)
                    streamInfo.codecInfo = { name: 'E-AC-3', type: 'Audio' };
                    break;

                default:
                    // 私有或未知descriptor
                    break;
            }

            offset += 2 + descriptorLength;
        }
    }

    // 获取编解码器信息
    private getCodecInfo(streamType: number): { name: string; type: string } {
        /* HTTP Live Streaming (HLS) Sample Encryption
           see "MPEG-2 Stream Encryption Format for HTTP Live Streaming",
           https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/HLS_Sample_Encryption/ */
        switch (streamType) {
            // 视频流
            case 0x01: return { name: 'MPEG-1', type: 'Video' };
            case 0x02: return { name: 'MPEG-2', type: 'Video' };
            case 0x10: return { name: 'MPEG-4 Visual', type: 'Video' };
            case 0x1B: return { name: 'H.264/AVC', type: 'Video' };
            case 0x20: return { name: 'MVC', type: 'Video' };
            case 0x21: return { name: 'JPEG2000', type: 'Video' };
            case 0x24: return { name: 'H.265/HEVC', type: 'Video' };
            case 0x33: return { name: 'H.266/VVC', type: 'Video' };
            case 0x42: return { name: 'AVS', type: 'Video' };
            case 0xD1: return { name: 'Dirac', type: 'Video' };
            case 0xD2: return { name: 'AVS2', type: 'Video' };
            case 0xD4: return { name: 'AVS3', type: 'Video' };
            case 0xdb: return { name: 'H.264/AVC', type: 'Video' }; // HLS-SE
            case 0xEA: return { name: 'VC-1', type: 'Video' };

            // 音频流
            case 0x03: return { name: 'MPEG-1 Audio', type: 'Audio' };
            case 0x04: return { name: 'MPEG-2 Audio', type: 'Audio' };
            case 0x0F: return { name: 'AAC', type: 'Audio' };
            case 0x11: return { name: 'AAC (LATM)', type: 'Audio' };
            case 0x1c: return { name: 'MPEG-4', type: 'Audio' };
            case 0x80: return { name: 'LPCM', type: 'Audio' }; // Blu-ray
            case 0x81: return { name: 'AC-3', type: 'Audio' }; // Blu-ray
            case 0x82: return { name: 'DTS', type: 'Audio' }; // Blu-ray
            case 0x83: return { name: 'TrueHD', type: 'Audio' }; // Blu-ray
            case 0x84: return { name: 'E-AC-3', type: 'Audio' }; // Blu-ray
            case 0x85: return { name: 'DTS-HD HRA', type: 'Audio' }; // Blu-ray
            case 0x86: return { name: 'DTS-HD MA', type: 'Audio' }; // Blu-ray
            case 0x87: return { name: 'E-AC-3', type: 'Audio' }; // Blu-ray
            case 0xA1: return { name: 'E-AC-3 (secondary)', type: 'Audio' }; // Blu-ray
            case 0xA2: return { name: 'DTS Express (secondary)', type: 'Audio' }; // Blu-ray
            case 0xc1: return { name: 'AC-3', type: 'Audio' }; // HLS-SE
            case 0xc2: return { name: 'E-AC-3', type: 'Audio' }; // HLS-SE
            case 0xcf: return { name: 'AAC', type: 'Audio' }; // HLS-SE
            case 0xD5: return { name: 'Audio Vivid', type: 'Audio' };

            // 字幕流
            case 0x12: return { name: 'Packed PES', type: 'Data' };
            case 0x90: return { name: 'PGS', type: 'Subtitle' }; // Blu-ray
            case 0x92: return { name: 'Text', type: 'Subtitle' }; // Blu-ray
            
            // 系统流
            case 0x09: return { name: 'ITU-T Rec. H.222.1', type: 'System' };
            case 0x1C: return { name: 'MPEG-4 SL', type: 'System' };
            case 0x1D: return { name: 'MPEG-4 FlexMux', type: 'System' };

            // 数据流
            case 0x05: return { name: 'Private Section', type: 'Data' };
            case 0x06: return { name: 'Private PES', type: 'Data' };
            case 0x13: return { name: 'DSM-CC', type: 'Data' };
            case 0x15: return { name: 'Metadata', type: 'Data' };
            case 0x0A: return { name: 'ISO/IEC 13818-6 type A', type: 'Data' };
            case 0x0B: return { name: 'ISO/IEC 13818-6 type B', type: 'Data' };
            case 0x0C: return { name: 'ISO/IEC 13818-6 type C', type: 'Data' };
            case 0x0D: return { name: 'ISO/IEC 13818-6 type D', type: 'Data' };


            default: return { name: `Unknown (0x${streamType.toString(16).toUpperCase().padStart(2, '0')})`, type: 'Unknown' };
        }
    }

    // 显示分析结果
    private showResults(file: File, isPartialParse: boolean): void {
        const analysisSection = document.getElementById('analysisSection') as HTMLElement;
        const resultsSection = document.getElementById('resultsSection') as HTMLElement;
        const uploadSection = document.querySelector('.upload-section') as HTMLElement;
        const reUploadBtn = document.getElementById('reUploadBtn') as HTMLElement;

        analysisSection.style.display = 'none';
        resultsSection.style.display = 'block';

        // 隐藏整个上传区域
        if (uploadSection) {
            uploadSection.style.display = 'none';
        }

        // 显示重新上传按钮
        if (reUploadBtn) {
            reUploadBtn.style.display = 'inline-block';
        }

        // 设置重新上传按钮事件监听器
        this.setupReUploadButton();

        // 显示基本信息
        this.displayBasicInfo(file, isPartialParse);

        // 显示流信息
        this.displayAllProgramSections();
    }

    // 显示基本信息
    private displayBasicInfo(file: File, isPartialParse: boolean): void {
        // 文件大小
        const fileSizeElement = document.getElementById('fileSizeResult') as HTMLElement;
        if (fileSizeElement) {
            fileSizeElement.textContent = this.formatFileSize(file.size);
        }

        // PMT PID
        const pmtPidElement = document.getElementById('pmtPid') as HTMLElement;
        if (pmtPidElement) {
            if (this.programs.size > 0) {
                const pmtPids = Array.from(this.programs.values())
                    .map(p => `0x${p.pmtPid.toString(16).toUpperCase().padStart(4, '0')}`);
                pmtPidElement.textContent = pmtPids.join(', ');
            } else {
                pmtPidElement.textContent = '未知';
            }
        }

        // 流数量
        const streamCountElement = document.getElementById('streamCount') as HTMLElement;
        if (streamCountElement) {
            streamCountElement.textContent = this.streams.size.toString();
        }
    }

    // 显示错误信息
    private showError(message: string): void {
        const analysisSection = document.getElementById('analysisSection') as HTMLElement;
        const resultsSection = document.getElementById('resultsSection') as HTMLElement;

        analysisSection.style.display = 'none';
        resultsSection.style.display = 'block';

        // 创建错误显示元素
        resultsSection.innerHTML = `
            <div class="error-message">
                <h3>解析失败</h3>
                <p>${message}</p>
                <button onclick="location.reload()">重新开始</button>
            </div>
        `;
    }

    // 设置重新上传按钮
    private setupReUploadButton(): void {
        const reUploadBtn = document.getElementById('reUploadBtn') as HTMLButtonElement;
        if (reUploadBtn) {
            reUploadBtn.addEventListener('click', () => {
                // 显示上传区域
                const uploadSection = document.querySelector('.upload-section') as HTMLElement;
                const resultsSection = document.getElementById('resultsSection') as HTMLElement;

                if (uploadSection) {
                    uploadSection.style.display = 'block';
                }
                if (resultsSection) {
                    resultsSection.style.display = 'none';
                }

                // 隐藏重新上传按钮
                reUploadBtn.style.display = 'none';

                // 重置分析器状态
                this.resetAnalyzer();
            });
        }
    }

    // 重置分析器状态
    private resetAnalyzer(): void {
        this.programs.clear();
        this.streams.clear();
        this.pesReassembly.clear();
        this.detectionPids.clear();
        this.detectionResults.clear();
        this.initializingPromises.clear();
        this.packetCount = 0;
        this.actualProcessedPackets = undefined;
        this.isPartialParse = false;
        this.patCount = 0;
        this.pmtCount = 0;
        this.patParsed = false;
        this.unparsedPmtPids.clear();
        this.allPmtsParsed = false;
        this.pmtPids.clear();
    }

    // 格式化文件大小
    private formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        let i = 0;
        while (bytes >= k) {
            bytes /= k;
            i++;
        }

        return parseFloat(bytes.toFixed(2)) + ' ' + sizes[i];
    }

    // 新：显示所有节目区块的主函数
    private displayAllProgramSections(): void {
        const streamsContainer = document.getElementById('streamsContainer');
        if (!streamsContainer) return;

        streamsContainer.innerHTML = ''; // 清空之前的内容

        if (this.programs.size === 0) {
            // 如果没有节目，可以显示一条消息
            streamsContainer.innerHTML = '<h4>未发现任何节目 (Program)。</h4>';
            return;
        }

        let allHtml = '';
        for (const [programNumber, program] of this.programs) {
            // 检查该节目是否有avsDetails
            const hasAvsDetails = Array.from(program.streams.values()).some(stream => stream.avsDetails);
            const hasAVSV = this.hasAVSVVideo(program);
            const hasNonAVSV = this.hasNonAVSVContent(program);
            
            // 如果只有AVSV内容，按钮在AVSV未勾选时应该禁用
            const shouldDisableWhenAVSVUnchecked = hasAVSV && !hasNonAVSV;
            
            allHtml += `
                <div class="streams-section">
                    <div class="program-header">
                        <h3>节目 ${programNumber} (PMT PID: 0x${program.pmtPid.toString(16).toUpperCase().padStart(4, '0')})</h3>
                        ${hasAvsDetails ? `
                            <div class="copy-buttons">
                                <button class="copy-info-btn copy-text-btn ${shouldDisableWhenAVSVUnchecked ? 'conditionally-disabled' : ''}" 
                                        onclick="copyProgramInfo(${programNumber})" 
                                        data-program="${programNumber}">Text 📋</button>
                                <button class="copy-info-btn copy-bbcode-btn ${shouldDisableWhenAVSVUnchecked ? 'conditionally-disabled' : ''}" 
                                        onclick="copyProgramInfoBBCode(${programNumber})" 
                                        data-program="${programNumber}">BBCode 📋</button>
                                <div class="copy-options">
                                    <label class="option-checkbox">
                                        <input type="checkbox" id="hiddenFormat_${programNumber}">
                                        <span>隐藏格式</span>
                                    </label>
                                    ${hasAVSV ? `
                                        <label class="option-checkbox">
                                            <input type="checkbox" id="includeAVSV_${programNumber}" 
                                                   onchange="updateButtonStates(${programNumber})">
                                            <span>AVSV</span>
                                        </label>
                                    ` : ''}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                    <div class="streams-table-container">
                        <table class="streams-table">
                            <thead>
                                <tr>
                                    <th>PID</th>
                                    <th>流类型</th>
                                    <th>编码格式</th>
                                    <th>语言</th>
                                    <th>格式标识符</th>
                                    <th>描述</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${this.generateStreamRowsHtml(program)}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }
        streamsContainer.innerHTML = allHtml;
        
        // 添加复制功能到全局作用域
        (window as any).copyProgramInfo = (programNumber: number) => {
            this.copyProgramInfo(programNumber);
        };
        (window as any).copyProgramInfoBBCode = (programNumber: number) => {
            this.copyProgramInfoBBCode(programNumber);
        };
        
        // 添加按钮状态更新函数到全局作用域
        (window as any).updateButtonStates = (programNumber: number) => {
            this.updateButtonStates(programNumber);
        };
    }

    // 复制节目信息的方法
    private copyProgramInfo(programNumber: number): void {
        const program = this.programs.get(programNumber);
        if (!program) return;

        // 获取AVSV选项状态
        const includeAVSVCheckbox = document.getElementById(`includeAVSV_${programNumber}`) as HTMLInputElement;
        const includeAVSV = includeAVSVCheckbox?.checked || false; // 默认为false

        // 收集该节目中所有流的avsDetails信息
        const avsDetailsList: string[] = [];
        
        for (const [pid, stream] of program.streams) {
            if (stream.avsDetails) {
                // 如果不包含AVSV且当前是AVSV视频流，则跳过
                if (!includeAVSV && stream.formatIdentifier === 'AVSV') {
                    continue;
                }

                const copyText = this.isAVSAudioStream(stream.streamType) 
                    ? AVSAudioInfoToCopyFormat(stream.avsDetails as AVSAudioInfo, pid)
                    : AVSVideoInfoToCopyFormat(stream.avsDetails as AVSVideoInfo, pid);
                avsDetailsList.push(copyText);
            }
        }

        if (avsDetailsList.length === 0) {
            // 如果没有avsDetails，复制空字符串
            navigator.clipboard.writeText('').then(() => {
                this.showCopyNotification('已复制空内容');
            }).catch(err => {
                console.error('复制失败:', err);
                this.showCopyNotification('复制失败');
            });
            return;
        }

        // 各项间空一行
        const combinedText = avsDetailsList.join('\n\n');

        navigator.clipboard.writeText(combinedText).then(() => {
            this.showCopyNotification('已复制节目信息');
        }).catch(err => {
            console.error('复制失败:', err);
            this.showCopyNotification('复制失败');
        });
    }

    // 复制节目信息为BBCode格式的方法
    private copyProgramInfoBBCode(programNumber: number): void {
        const program = this.programs.get(programNumber);
        if (!program) return;

        // 获取选项状态
        const hiddenFormatCheckbox = document.getElementById(`hiddenFormat_${programNumber}`) as HTMLInputElement;
        const includeAVSVCheckbox = document.getElementById(`includeAVSV_${programNumber}`) as HTMLInputElement;
        
        const useHiddenFormat = hiddenFormatCheckbox?.checked || false;
        const includeAVSV = includeAVSVCheckbox?.checked || false; // 默认为false

        // 收集该节目中所有流的avsDetails信息
        const avsDetailsList: string[] = [];
        
        for (const [pid, stream] of program.streams) {
            if (stream.avsDetails) {
                // 如果不包含AVSV且当前是AVSV视频流，则跳过
                if (!includeAVSV && stream.formatIdentifier === 'AVSV') {
                    continue;
                }

                const copyText = this.isAVSAudioStream(stream.streamType) 
                    ? AVSAudioInfoToCopyFormat(stream.avsDetails as AVSAudioInfo, pid)
                    : AVSVideoInfoToCopyFormat(stream.avsDetails as AVSVideoInfo, pid);
                avsDetailsList.push(copyText);
            }
        }

        if (avsDetailsList.length === 0) {
            // 如果没有avsDetails，复制空字符串
            navigator.clipboard.writeText('').then(() => {
                this.showCopyNotification('已复制空内容');
            }).catch(err => {
                console.error('复制失败:', err);
                this.showCopyNotification('复制失败');
            });
            return;
        }

        // 根据选项生成不同的BBCode格式
        let combinedText: string;
        if (useHiddenFormat) {
            combinedText = '[spoiler="AVS Additional Mediainfo"]\n' + avsDetailsList.join('\n\n') + '\n[/spoiler]';
        } else {
            combinedText = '[quote]\n' + avsDetailsList.join('\n\n') + '\n[/quote]';
        }

        navigator.clipboard.writeText(combinedText).then(() => {
            this.showCopyNotification('已复制BBCode格式');
        }).catch(err => {
            console.error('复制失败:', err);
            this.showCopyNotification('复制失败');
        });
    }

    // 更新按钮状态
    private updateButtonStates(programNumber: number): void {
        const program = this.programs.get(programNumber);
        if (!program) return;

        const includeAVSVCheckbox = document.getElementById(`includeAVSV_${programNumber}`) as HTMLInputElement;
        const textBtn = document.querySelector(`button[data-program="${programNumber}"].copy-text-btn`) as HTMLButtonElement;
        const bbcodeBtn = document.querySelector(`button[data-program="${programNumber}"].copy-bbcode-btn`) as HTMLButtonElement;

        if (!includeAVSVCheckbox || !textBtn || !bbcodeBtn) return;

        const hasAVSV = this.hasAVSVVideo(program);
        const hasNonAVSV = this.hasNonAVSVContent(program);
        const includeAVSV = includeAVSVCheckbox.checked;

        // 如果只有AVSV内容且AVSV未勾选，禁用按钮
        const shouldDisable = hasAVSV && !hasNonAVSV && !includeAVSV;

        if (shouldDisable) {
            // 移除初始状态类，添加禁用类
            textBtn.classList.remove('conditionally-disabled');
            bbcodeBtn.classList.remove('conditionally-disabled');
            textBtn.classList.add('disabled');
            bbcodeBtn.classList.add('disabled');
            textBtn.disabled = true;
            bbcodeBtn.disabled = true;
        } else {
            // 移除所有禁用相关的类
            textBtn.classList.remove('disabled', 'conditionally-disabled');
            bbcodeBtn.classList.remove('disabled', 'conditionally-disabled');
            textBtn.disabled = false;
            bbcodeBtn.disabled = false;
        }
    }

    // 显示复制通知
    private showCopyNotification(message: string): void {
        // 创建通知元素
        const notification = document.createElement('div');
        notification.className = 'copy-notification';
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #4CAF50;
            color: white;
            padding: 10px 20px;
            border-radius: 5px;
            z-index: 1000;
            font-size: 14px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        `;

        document.body.appendChild(notification);

        // 2秒后自动移除
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 2000);
    }

    // 重构：只负责生成单个节目表格主体(tbody)的HTML
    private generateStreamRowsHtml(program: ProgramInfo): string {
        if (program.streams.size === 0) {
            return '<tr><td colspan="6">该节目中未发现流。</td></tr>';
        }

        let tbodyHtml = '';
        for (const [pid, stream] of program.streams) {
            const pidHex = `0x${pid.toString(16).toUpperCase().padStart(4, '0')}`;
            tbodyHtml += `
                <tr>
                    <td>${pidHex}</td>
                    <td>${stream.codecInfo.type}</td>
                    <td>
                        <div class="codec-info-container">
                            <div class="codec-info-text">
                                ${stream.codecInfo.name}
                                ${stream.streamType ? `<br><small>Stream Type: 0x${stream.streamType.toString(16).toUpperCase().padStart(2, '0')}</small>` : ''}
                            </div>
                            ${stream.avsDetails ? `<button class="toggle-details-btn" onclick="toggleDetails('avs-info-${pid}')">⏬</button>` : ''}
                        </div>
                    </td>
                    <td>${stream.language || ''}</td>
                    <td>${stream.formatIdentifier || ''}</td>
                    <td>
                        <div class="codec-info-container">
                            <div class="codec-info-text">
                                ${stream.description.join('<br>') || ''}
                            </div>
                            ${stream.avsDescriptor ? `<button class="toggle-details-btn" onclick="toggleDetails('avs-desc-${pid}')">⏬</button>` : ''}
                        </div>
                    </td>
                </tr>
            `;

            if (stream.avsDescriptor) {
                tbodyHtml += `
                    <tr id="avs-desc-${pid}" class="avs-details-row" style="display: none;">
                        <td colspan="6">
                            ${this.formatDetailsCard(stream.avsDescriptor, 'descriptor', stream.streamType)}
                        </td>
                    </tr>
                `;
            }
            
            if (stream.avsDetails) {
                tbodyHtml += `
                    <tr id="avs-info-${pid}" class="avs-details-row" style="display: none;">
                        <td colspan="6">
                            ${this.formatDetailsCard(stream.avsDetails, 'info', stream.streamType)}
                        </td>
                    </tr>
                `;
            }
        }
        return tbodyHtml;
    }

    // 格式化通用详情卡片
    private formatDetailsCard(data: AVSVideoInfo | AVSVideoDescriptor | AVSAudioInfo | AVSAudioDescriptor, type: 'info' | 'descriptor', streamType?: number): string {
        const isInfoCard = type === 'info';
        const isAudioStream = streamType === 0xd5;
        
        const title = isInfoCard 
            ? (isAudioStream ? 'AVS 音频流详细信息' : 'AVS 视频流详细信息')
            : (isAudioStream ? 'AVS 音频描述' : 'AVS 视频描述');
        const icon = isInfoCard 
            ? (isAudioStream ? '🎵' : '🎬')
            : 'ℹ️';
        const highlightColor = isInfoCard 
            ? (isAudioStream ? '#ff6b6b' : '#28a745') 
            : (isAudioStream ? '#fd7e14' : '#17a2b8');

        const items = isInfoCard 
            ? (isAudioStream 
                ? AVSAudioInfoToDisplayItems(data as AVSAudioInfo)
                : AVSVideoInfoToDisplayItems(data as AVSVideoInfo))
            : (isAudioStream 
                ? AVSAudioDescriptorToDisplayItems(data as AVSAudioDescriptor)
                : AVSVideoDescriptorToDisplayItems(data as AVSVideoDescriptor));
        
        const totalItems = items.length;
        const itemsPerColumn = Math.ceil(totalItems / 2);
        const leftColumnItems = items.slice(0, itemsPerColumn);
        const rightColumnItems = items.slice(itemsPerColumn);
        
        const generateItemHTML = (item: { label: string; value: string; isHighlight?: boolean }) => {
            const valueHTML = item.isHighlight 
                ? `<span style="background: ${highlightColor}; color: white; padding: 0.3rem 0.8rem; border-radius: 4px; font-weight: 600;">${item.value}</span>`
                : item.value;
            
            return `
                <div class="avs-info-item">
                    <label>${item.label}</label>
                    <span>${valueHTML}</span>
                </div>
            `;
        };
        
        const leftColumnHTML = leftColumnItems.map(generateItemHTML).join('');
        const rightColumnHTML = rightColumnItems.map(generateItemHTML).join('');
        
        return `
            <div class="avs-details-card">
                <div class="avs-card-header">
                    <span class="avs-icon">${icon}</span>
                    <h5>${title}</h5>
                </div>
                <div class="avs-card-content">
                    <div class="avs-info-section">
                        ${leftColumnHTML}
                    </div>
                    <div class="avs-info-section">
                        ${rightColumnHTML}
                    </div>
                </div>
            </div>
        `;
    }
}

// 移除自动初始化，由MediaAnalyzer控制

// 全局函数：切换详情显示
(window as any).toggleDetails = function(rowId: string) {
    const detailsRow = document.getElementById(rowId);
    const button = document.querySelector(`button[onclick*="${rowId}"]`) as HTMLButtonElement;
    
    if (detailsRow && button) {
        if (detailsRow.style.display === 'none') {
            detailsRow.style.display = 'table-row';
            button.innerHTML = '⏫';
        } else {
            detailsRow.style.display = 'none';
            button.innerHTML = '⏬';
        }
    }
};