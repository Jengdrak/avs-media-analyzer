// 通用媒体分析器 - 处理非TS文件
import { AVSAudioInfo, AVSAudioInfoToDisplayItems, AVSAudioInfoToCopyFormat } from './avs-info.js';

// 通用媒体流信息接口
interface GenericStreamInfo {
    index: number;
    codecType: number;
    codecName: string;
    streamType: string; // video/audio/subtitle等
    avsDetails?: AVSAudioInfo;
}

export class GenericMediaAnalyzer {
    private demuxer: any;
    private av3aAnalyzer: any;
    private mediaInfo: any;
    private streamAnalysisResults: Map<number, any> = new Map();
    private streams: Map<number, GenericStreamInfo> = new Map(); // 存储流信息

    constructor() {
        // 初始化
    }

    // 处理文件
    public async handleFile(file: File): Promise<void> {
        this.showFileInfo(file);
        this.showAnalysisSection();
        
        try {
            // 初始化 WebDemuxer
            await this.initializeWebDemuxer();
            
            // 分析文件
            await this.analyzeFile(file);
            
            // 显示结果
            this.showResults(file);
        } catch (error) {
            console.error('解析错误:', error);
            this.showError('文件解析失败: ' + (error as Error).message);
        }
    }

    // 初始化 WebDemuxer
    private async initializeWebDemuxer(): Promise<void> {
        const { WebDemuxer } = await import('https://cdn.jsdelivr.net/npm/web-demuxer/+esm' as any);
        
        this.demuxer = new WebDemuxer({
            wasmFilePath: "https://cdn.jsdelivr.net/npm/web-demuxer@latest/dist/wasm-files/web-demuxer.wasm"
        });
        
        // 设置日志级别为警告，减少控制台输出
        this.demuxer.setLogLevel(24); // AV_LOG_WARNING
    }

    // 分析文件
    private async analyzeFile(file: File): Promise<void> {
        // 使用 WebDemuxer 分析文件
        await this.demuxer.load(file);
        
        // 获取媒体信息
        this.mediaInfo = await this.demuxer.getMediaInfo();
        console.log('媒体信息:', this.mediaInfo);
        
        // 分析各个流
        if (this.mediaInfo.streams && this.mediaInfo.streams.length > 0) {
            await this.analyzeStreams();
        }
    }

    // 分析各个流
    private async analyzeStreams(): Promise<void> {
        for (let i = 0; i < this.mediaInfo.streams.length; i++) {
            const stream = this.mediaInfo.streams[i];
            
            // 检查是否为音频流且可能是 AV3A
            if (stream.codec_type === 1 && // 音频流
                (stream.codec_name === 'av3a' || !stream.codec_name || stream.codec_name === '')) {
                
                console.log(`检测到疑似 AV3A 音频流，索引: ${i}`);
                
                try {
                    // 尝试 AV3A 分析
                    const av3aResult = await this.tryAV3AAnalysis(stream);
                    if (av3aResult) {
                        // 更新流信息
                        stream.codec_name = 'av3a';
                        this.streamAnalysisResults.set(i, av3aResult);
                        console.log(`✅ AV3A 分析成功，流索引: ${i}`);
                    }
                } catch (error) {
                    console.warn(`AV3A 分析失败，流索引: ${i}`, error);
                }
            }
        }
    }

    // 尝试 AV3A 分析
    private async tryAV3AAnalysis(stream: any): Promise<any> {
        try {
            // 获取首包数据
            const packet = await this.demuxer.getAVPacket(
                0,                    // time: 时间点 0 秒
                stream.codec_type,    // streamType: 流类型（数字）
                stream.index,         // streamIndex: 流索引
                0                     // seekFlag: 搜索标志
            );

            if (!packet || !packet.data || packet.data.length === 0) {
                throw new Error('无法获取数据包');
            }

            // 初始化 AV3A 分析器（如果还没有）
            if (!this.av3aAnalyzer) {
                const av3aModule = await import('./av3a-analyzer.js');
                this.av3aAnalyzer = new av3aModule.AV3AAnalyzer();
                console.log('⚡ AV3A 分析器已初始化');
            }

            // 使用 AV3A 分析器分析数据包
            const analysisResult = this.av3aAnalyzer.analyze(packet.data);
            
            if (analysisResult) {
                return {
                    avsDetails: analysisResult,
                    packetData: packet.data.slice(0, 100) // 保存前100字节用于显示
                };
            }
            
            return null;
        } catch (error) {
            console.warn('AV3A 分析失败:', error);
            return null;
        }
    }

    // 显示文件信息
    private showFileInfo(file: File): void {
        const fileInfo = document.getElementById('fileInfo') as HTMLElement;
        const fileName = document.getElementById('fileName') as HTMLElement;
        const fileSize = document.getElementById('fileSize') as HTMLElement;

        if (fileName) fileName.textContent = file.name;
        if (fileSize) fileSize.textContent = this.formatFileSize(file.size);
        if (fileInfo) fileInfo.style.display = 'flex';
    }

    // 显示分析区域
    private showAnalysisSection(): void {
        const analysisSection = document.getElementById('analysisSection') as HTMLElement;
        const resultsSection = document.getElementById('resultsSection') as HTMLElement;

        if (analysisSection) analysisSection.style.display = 'block';
        if (resultsSection) resultsSection.style.display = 'none';

        this.updateProgress(0);
    }

    // 模拟分析过程
    private async simulateAnalysis(): Promise<void> {
        for (let i = 0; i <= 100; i += 10) {
            this.updateProgress(i);
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    // 更新进度
    private updateProgress(percent: number): void {
        const progressBar = document.getElementById('progressBar') as HTMLElement;
        if (progressBar) {
            progressBar.style.width = percent + '%';
        }
    }

    // 显示结果
    private showResults(file: File): void {
        const analysisSection = document.getElementById('analysisSection') as HTMLElement;
        const resultsSection = document.getElementById('resultsSection') as HTMLElement;
        const uploadSection = document.querySelector('.upload-section') as HTMLElement;
        const reUploadBtn = document.getElementById('reUploadBtn') as HTMLElement;

        if (analysisSection) analysisSection.style.display = 'none';
        if (resultsSection) resultsSection.style.display = 'block';

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
        this.displayBasicInfo(file);

        // 显示空的流信息
        this.displayStreams();
    }

    // 显示基本信息
    private displayBasicInfo(file: File): void {
        // 文件大小
        const fileSizeElement = document.getElementById('fileSizeResult') as HTMLElement;
        if (fileSizeElement) {
            fileSizeElement.textContent = this.formatFileSize(file.size);
        }

        // 隐藏PMT PID（通用媒体文件不需要）
        const pmtPidElement = document.getElementById('pmtPid') as HTMLElement;
        if (pmtPidElement) {
            const pmtPidContainer = pmtPidElement.closest('.info-item') as HTMLElement;
            if (pmtPidContainer) {
                pmtPidContainer.style.display = 'none';
            }
        }

        // 流数量
        const streamCountElement = document.getElementById('streamCount') as HTMLElement;
        if (streamCountElement) {
            const streamCount = this.mediaInfo?.streams?.length || 0;
            streamCountElement.textContent = streamCount.toString();
        }
    }

    // 显示流信息
    private displayStreams(): void {
        const streamsContainer = document.getElementById('streamsContainer');
        if (!streamsContainer) return;

        // 创建通用媒体文件的流信息显示
        const streamRows = this.generateStreamRows();
        
        streamsContainer.innerHTML = `
            <div class="streams-section">
                <div class="program-header">
                    <h3>媒体流信息</h3>
                </div>
                <div class="streams-table-container">
                    <table class="streams-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>流类型</th>
                                <th>编码格式</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${streamRows}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    // 生成流行数据
    private generateStreamRows(): string {
        if (!this.mediaInfo?.streams || this.mediaInfo.streams.length === 0) {
            return `
                <tr>
                    <td colspan="3" style="text-align: center; padding: 20px; color: #666;">
                        暂无流信息
                    </td>
                </tr>
            `;
        }

        let html = '';
        
        for (let i = 0; i < this.mediaInfo.streams.length; i++) {
            const stream = this.mediaInfo.streams[i];
            const streamType = this.getStreamTypeString(stream.codec_type);
            const codecName = stream.codec_name || 'Unknown';
            const analysisResult = this.streamAnalysisResults.get(i);
            
            html += `
                <tr>
                    <td>${stream.index !== undefined ? stream.index : i}</td>
                    <td>${streamType}</td>
                    <td>
                        <div class="codec-info-container">
                            <div class="codec-info-text">
                                ${codecName}
                            </div>
                            ${analysisResult ? `<button class="toggle-details-btn" onclick="toggleDetails('avs-info-${i}')">⏬</button>` : ''}
                        </div>
                    </td>
                </tr>
            `;

            // 如果有 AV3A 分析结果，添加展开行
            if (analysisResult) {
                html += `
                    <tr id="avs-info-${i}" class="avs-details-row" style="display: none;">
                        <td colspan="3">
                            ${this.formatAVSDetailsCard(analysisResult.avsDetails)}
                        </td>
                    </tr>
                `;
            }
        }

        return html;
    }

    // 获取流类型字符串
    private getStreamTypeString(codecType: number): string {
        const typeNames: { [key: number]: string } = {
            [-1]: 'unknown',
            [0]: 'video',
            [1]: 'audio', 
            [2]: 'data',
            [3]: 'subtitle',
            [4]: 'attachment'
        };
        return typeNames[codecType] || 'unknown';
    }


    // 格式化 AVS 详细信息卡片（沿用 TS 分析器的 UI 逻辑）
    private formatAVSDetailsCard(avsDetails: AVSAudioInfo): string {
        // 使用 TS 分析器的标准格式化函数
        const displayItems = AVSAudioInfoToDisplayItems(avsDetails);
        
        const totalItems = displayItems.length;
        const itemsPerColumn = Math.ceil(totalItems / 2);
        const leftColumnItems = displayItems.slice(0, itemsPerColumn);
        const rightColumnItems = displayItems.slice(itemsPerColumn);
        
        const generateItemHTML = (item: { label: string; value: string; isHighlight?: boolean }) => {
            const valueHTML = item.isHighlight 
                ? `<span style="background: #ff6b6b; color: white; padding: 0.3rem 0.8rem; border-radius: 4px; font-weight: 600;">${item.value}</span>`
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
                    <span class="avs-icon">🎵</span>
                    <h5>AV3A 音频流详细信息</h5>
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

    // 设置重新上传按钮
    private setupReUploadButton(): void {
        const reUploadBtn = document.getElementById('reUploadBtn') as HTMLButtonElement;
        if (reUploadBtn) {
            // 清除之前的事件监听器
            reUploadBtn.replaceWith(reUploadBtn.cloneNode(true));
            const newReUploadBtn = document.getElementById('reUploadBtn') as HTMLButtonElement;
            
            newReUploadBtn.addEventListener('click', () => {
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
                newReUploadBtn.style.display = 'none';

                // 重置状态
                this.resetState();
            });
        }
    }

    // 重置状态
    private resetState(): void {
        const fileInfo = document.getElementById('fileInfo') as HTMLElement;
        if (fileInfo) {
            fileInfo.style.display = 'none';
        }

        // 重新显示PMT PID项
        const pmtPidElement = document.getElementById('pmtPid') as HTMLElement;
        if (pmtPidElement) {
            const pmtPidContainer = pmtPidElement.closest('.info-item') as HTMLElement;
            if (pmtPidContainer) {
                pmtPidContainer.style.display = 'flex';
            }
        }
    }

    // 显示错误信息
    private showError(message: string): void {
        const analysisSection = document.getElementById('analysisSection') as HTMLElement;
        const resultsSection = document.getElementById('resultsSection') as HTMLElement;

        if (analysisSection) analysisSection.style.display = 'none';
        if (resultsSection) {
            resultsSection.style.display = 'block';
            resultsSection.innerHTML = `
                <div class="error-message">
                    <h3>解析失败</h3>
                    <p>${message}</p>
                    <button onclick="location.reload()">重新开始</button>
                </div>
            `;
        }
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
}