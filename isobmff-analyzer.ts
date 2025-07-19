// ISO BMFF (MP4) 分析器 - 专门处理 AVS codec
import { AVSVideoInfo, AVSAudioInfo, AVSAudioInfoToDisplayItems, AVSAudioInfoToCopyFormat, AVSVideoInfoToDisplayItems, AVSVideoInfoToCopyFormat } from './avs-info.js';
import { AVS2Analyzer } from './avs2-analyzer.js';
import { AVS3Analyzer } from './avs3-analyzer.js';

// MP4 track 信息接口
interface MP4TrackInfo {
    id: number;
    type: string; // 'video' 或 'audio'
    codec: string; // FourCC
    avsDetails?: AVSVideoInfo | AVSAudioInfo;
}

export class ISOMBFFAnalyzer {
    private mp4boxFile: any;
    private tracks: Map<number, MP4TrackInfo> = new Map();
    private sampleDataMap: Map<number, Uint8Array> = new Map(); // 独立的样本数据存储
    private avs2Analyzer: AVS2Analyzer | null = null;
    private avs3Analyzer: AVS3Analyzer | null = null;
    private av3aAnalyzer: any = null;
    private mediaInfo: any;
    private targetCodecs = ['avst', 'avs3', 'av3a']; // 目标 codec FourCC

    constructor() {
        // 初始化
    }

    // 处理文件
    public async handleFile(file: File): Promise<void> {
        this.showFileInfo(file);
        this.showAnalysisSection();
        
        try {
            // 初始化 MP4Box.js
            await this.initializeMP4Box();
            
            // 分析文件
            await this.analyzeFile(file);
            
            // 统一解析收集到的样本数据
            await this.analyzeAllSamples();
            
            // 显示结果
            this.showResults(file);
        } catch (error) {
            console.error('解析错误:', error);
            this.showError('文件解析失败: ' + (error as Error).message);
        }
    }

    // 初始化 MP4Box.js
    private async initializeMP4Box(): Promise<void> {
        // 使用动态导入加载 MP4Box
        const MP4Box = await import('https://cdn.jsdelivr.net/npm/mp4box@latest/dist/mp4box.all.min.js' as any);
        
        this.mp4boxFile = (MP4Box as any).createFile();
        console.log('⚡ MP4Box.js 已初始化');
    }

    // 分析文件
    private async analyzeFile(file: File): Promise<void> {
        return new Promise((resolve, reject) => {
            const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB chunks
            let position = 0;
            let readComplete = false;
            let moovParsed = false;
            const pendingTracks = new Map<number, string>(); // track_id -> FourCC
            const receivedSamples = new Set<number>();

            // 设置错误处理
            this.mp4boxFile.onError = (error: any) => {
                reject(new Error(`MP4Box 解析错误: ${error}`));
            };

            // 文件准备完成
            this.mp4boxFile.onReady = (info: any) => {
                this.mediaInfo = info;
                console.log('📁 文件信息:', info);
                
                moovParsed = true;
                
                // 处理 tracks
                this.processTracks(info.tracks);
                
                // 检查是否有需要解析的目标 codec tracks
                for (const track of info.tracks) {
                    const fourCC = this.extractFourCC(track.codec);
                    if (this.targetCodecs.includes(fourCC)) {
                        pendingTracks.set(track.id, fourCC);
                        console.log(`🎯 发现目标 codec track ${track.id} (${track.codec})`);
                        
                        // 设置样本提取
                        this.mp4boxFile.setExtractionOptions(track.id, null, {
                            nbSamples: 1 // 只提取一个样本
                        });
                    }
                }
                
                // 如果有目标 tracks，启动样本提取
                if (pendingTracks.size > 0) {
                    console.log(`开始为 ${pendingTracks.size} 个目标 codec track 提取样本`);
                    this.mp4boxFile.start();
                } else {
                    console.log('未发现目标 codec tracks');
                    readComplete = true;
                    resolve();
                }
            };

            // 样本数据回调
            this.mp4boxFile.onSamples = (track_id: number, _ref: any, samples: any[]) => {
                if (pendingTracks.has(track_id) && samples.length > 0 && !receivedSamples.has(track_id)) {
                    const codecInfo = pendingTracks.get(track_id)!;
                    const sample = samples[0];
                    
                    console.log(`📦 获取到 track ${track_id} (${codecInfo}) 样本:`, {
                        size: sample.size,
                        timestamp: sample.cts,
                        data: sample.data.slice(0, 16)
                    });
                    
                    // 存储样本数据到独立的Map
                    this.sampleDataMap.set(track_id, new Uint8Array(sample.data));
                    
                    receivedSamples.add(track_id);
                    
                    // 检查是否所有目标 track 都获取到了样本
                    if (receivedSamples.size === pendingTracks.size) {
                        console.log(`✅ 所有 ${pendingTracks.size} 个目标 codec track 的样本获取完成`);
                        readComplete = true;
                        resolve();
                    }
                }
            };

            // 需要更多数据时的回调
            this.mp4boxFile.onBuffer = () => {
                this.mp4boxFile.releaseUsedBuffers();
            };

            // 流式读取文件
            const readNextChunk = () => {
                if (readComplete || position >= file.size) {
                    if (!readComplete) {
                        this.mp4boxFile.flush();
                        readComplete = true;
                    }
                    return;
                }

                const remainingSize = file.size - position;
                const chunkSize = Math.min(CHUNK_SIZE, remainingSize);
                
                const reader = new FileReader();
                reader.onload = () => {
                    const arrayBuffer = reader.result as ArrayBuffer;
                    (arrayBuffer as any).fileStart = position;
                    
                    this.mp4boxFile.appendBuffer(arrayBuffer);
                    position += chunkSize;
                    
                    console.log(`读取进度: ${position} / ${file.size} bytes (${(position / file.size * 100).toFixed(1)}%)`);
                    
                    // 继续读取下一个块
                    setTimeout(readNextChunk, 0);
                };
                
                reader.onerror = () => reject(reader.error);
                
                const endPos = Math.min(position + chunkSize, file.size);
                const blob = file.slice(position, endPos);
                reader.readAsArrayBuffer(blob);
            };

            // 开始读取
            readNextChunk();
        });
    }

    // 处理 tracks 信息
    private processTracks(tracks: any[]): void {
        for (const track of tracks) {
            const fourCC = this.extractFourCC(track.codec);
            
            // 纠正可能识别错误的 track type
            const correctedType = this.correctTrackType(fourCC, track);
            
            const trackInfo: MP4TrackInfo = {
                id: track.id,
                type: correctedType,
                codec: fourCC
            };
            
            this.tracks.set(track.id, trackInfo);
            
            console.log(`📺 Track ${track.id}: ${trackInfo.type} - ${trackInfo.codec}`);
        }
    }

    // 提取 FourCC
    private extractFourCC(codecString: string): string {
        // codec 字符串可能是 'hev1.1.6.L153.90' 这样的格式
        // 我们需要提取前面的 FourCC 部分
        return codecString.split('.')[0];
    }

    // 纠正 track 类型
    private correctTrackType(fourCC: string, track: any): string {
        // 根据 fourCC 纠正可能识别错误的 track 类型
        switch (fourCC) {
            case 'avst':
                return 'video'; // AVS2 视频
            case 'avs3':
                return 'video'; // AVS3 视频
            case 'av3a':
                return 'audio'; // Audio Vivid 音频
            default:
                return track.type || (track.video ? 'video' : track.audio ? 'audio' : 'unknown');
        }
    }

    // 统一解析所有样本数据
    private async analyzeAllSamples(): Promise<void> {
        console.log('🔍 开始统一解析所有样本数据');
        
        for (const [trackId, sampleData] of this.sampleDataMap) {
            const trackInfo = this.tracks.get(trackId);
            if (trackInfo && this.targetCodecs.includes(trackInfo.codec)) {
                await this.analyzeSample(trackInfo, sampleData);
            }
        }
        
        console.log('🎉 所有样本解析完成');
    }

    // 分析样本数据
    private async analyzeSample(trackInfo: MP4TrackInfo, sampleData: Uint8Array): Promise<void> {
        const fourCC = trackInfo.codec;
        
        try {
            switch (fourCC) {
                case 'avst': // AVS2
                    await this.analyzeAVS2Sample(trackInfo, sampleData);
                    break;
                case 'avs3': // AVS3
                    await this.analyzeAVS3Sample(trackInfo, sampleData);
                    break;
                case 'av3a': // Audio Vivid
                    await this.analyzeAV3ASample(trackInfo, sampleData);
                    break;
                default:
                    console.log(`不支持的 codec: ${fourCC}`);
            }
        } catch (error) {
            console.warn(`分析 track ${trackInfo.id} (${fourCC}) 样本失败:`, error);
        }
    }

    // 分析 AVS2 样本
    private async analyzeAVS2Sample(trackInfo: MP4TrackInfo, sampleData: Uint8Array): Promise<void> {
        if (!this.avs2Analyzer) {
            this.avs2Analyzer = new AVS2Analyzer();
            console.log('⚡ AVS2 分析器已初始化');
        }

        const result = this.avs2Analyzer.analyze(sampleData);
        if (result) {
            trackInfo.avsDetails = result;
            console.log(`✅ AVS2 分析成功，track ${trackInfo.id}`);
        }
    }

    // 分析 AVS3 样本
    private async analyzeAVS3Sample(trackInfo: MP4TrackInfo, sampleData: Uint8Array): Promise<void> {
        if (!this.avs3Analyzer) {
            this.avs3Analyzer = new AVS3Analyzer();
            console.log('⚡ AVS3 分析器已初始化');
        }

        const result = this.avs3Analyzer.analyze(sampleData);
        if (result) {
            trackInfo.avsDetails = result;
            console.log(`✅ AVS3 分析成功，track ${trackInfo.id}`);
        }
    }

    // 分析 AV3A 样本
    private async analyzeAV3ASample(trackInfo: MP4TrackInfo, sampleData: Uint8Array): Promise<void> {
        if (!this.av3aAnalyzer) {
            const av3aModule = await import('./av3a-analyzer.js');
            this.av3aAnalyzer = new av3aModule.AV3AAnalyzer();
            console.log('⚡ AV3A 分析器已初始化');
        }

        const result = this.av3aAnalyzer.analyze(sampleData);
        if (result) {
            trackInfo.avsDetails = result;
            console.log(`✅ AV3A 分析成功，track ${trackInfo.id}`);
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

        // 显示 tracks 信息
        this.displayTracks();
        
        // 将复制方法添加到全局作用域
        (window as any).isobmffAnalyzer = this;
    }

    // 显示基本信息
    private displayBasicInfo(file: File): void {
        // 文件大小
        const fileSizeElement = document.getElementById('fileSizeResult') as HTMLElement;
        if (fileSizeElement) {
            fileSizeElement.textContent = this.formatFileSize(file.size);
        }

        // 隐藏PMT PID（MP4文件不需要）
        const pmtPidElement = document.getElementById('pmtPid') as HTMLElement;
        if (pmtPidElement) {
            const pmtPidContainer = pmtPidElement.closest('.info-item') as HTMLElement;
            if (pmtPidContainer) {
                pmtPidContainer.style.display = 'none';
            }
        }

        // Track 数量
        const streamCountElement = document.getElementById('streamCount') as HTMLElement;
        if (streamCountElement) {
            const trackCount = this.tracks.size;
            streamCountElement.textContent = trackCount.toString();
        }
    }

    // 显示 tracks 信息
    private displayTracks(): void {
        const streamsContainer = document.getElementById('streamsContainer');
        if (!streamsContainer) return;

        // 创建 MP4 tracks 的显示
        const trackRows = this.generateTrackRows();
        
        // 检查是否有 avsDetails
        const hasAvsDetails = Array.from(this.tracks.values()).some(track => track.avsDetails);
        
        streamsContainer.innerHTML = `
            <div class="streams-section">
                <div class="program-header">
                    <h3>MP4 Tracks 信息</h3>
                    ${hasAvsDetails ? `
                        <div class="copy-buttons">
                            <button class="copy-info-btn copy-text-btn" onclick="window.isobmffAnalyzer.copyTrackInfo()">Text 📋</button>
                            <button class="copy-info-btn copy-bbcode-btn" onclick="window.isobmffAnalyzer.copyTrackInfoBBCode()">BBCode 📋</button>
                            <div class="copy-options">
                                <label class="option-checkbox">
                                    <input type="checkbox" id="hiddenFormat_isobmff">
                                    <span>隐藏格式</span>
                                </label>
                            </div>
                        </div>
                    ` : ''}
                </div>
                <div class="streams-table-container">
                    <table class="streams-table">
                        <thead>
                            <tr>
                                <th>Track ID</th>
                                <th>类型</th>
                                <th>编码格式</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${trackRows}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    // 生成 track 行数据
    private generateTrackRows(): string {
        if (this.tracks.size === 0) {
            return `
                <tr>
                    <td colspan="3" style="text-align: center; padding: 20px; color: #666;">
                        暂无 track 信息
                    </td>
                </tr>
            `;
        }

        let html = '';
        
        for (const [trackId, track] of this.tracks) {
            html += `
                <tr>
                    <td>${trackId}</td>
                    <td>${track.type}</td>
                    <td>
                        <div class="codec-info-container">
                            <div class="codec-info-text">
                                ${track.codec}
                            </div>
                            ${track.avsDetails ? `<button class="toggle-details-btn" onclick="toggleDetails('avs-info-${trackId}')">⏬</button>` : ''}
                        </div>
                    </td>
                </tr>
            `;

            // 如果有 AVS 分析结果，添加展开行
            if (track.avsDetails) {
                html += `
                    <tr id="avs-info-${trackId}" class="avs-details-row" style="display: none;">
                        <td colspan="3">
                            ${this.formatAVSDetailsCard(track.avsDetails, track)}
                        </td>
                    </tr>
                `;
            }
        }

        return html;
    }

    // 格式化 AVS 详细信息卡片
    private formatAVSDetailsCard(avsDetails: AVSVideoInfo | AVSAudioInfo, track: MP4TrackInfo): string {
        // 根据 track 类型判断是音频还是视频
        const isAudioTrack = track.type === 'audio';
        
        // 使用对应的格式化函数
        const displayItems = isAudioTrack 
            ? AVSAudioInfoToDisplayItems(avsDetails as AVSAudioInfo)
            : AVSVideoInfoToDisplayItems(avsDetails as AVSVideoInfo);
        
        const totalItems = displayItems.length;
        const itemsPerColumn = Math.ceil(totalItems / 2);
        const leftColumnItems = displayItems.slice(0, itemsPerColumn);
        const rightColumnItems = displayItems.slice(itemsPerColumn);
        
        const generateItemHTML = (item: { label: string; value: string; isHighlight?: boolean }) => {
            const highlightColor = isAudioTrack ? '#ff6b6b' : '#28a745';
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
        
        // 根据类型设置不同的图标和标题
        const icon = isAudioTrack ? '🎵' : '🎬';
        const title = isAudioTrack ? 'AVS 音频流详细信息' : 'AVS 视频流详细信息';
        
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

    // 复制 track 信息的方法（Text格式）
    public copyTrackInfo(): void {
        // 收集有 avsDetails 的 track 信息
        const avsDetailsList: string[] = [];
        
        for (const [trackId, track] of this.tracks) {
            if (track.avsDetails) {
                // 根据 track 类型选择正确的格式化函数
                const isAudioTrack = track.type === 'audio';
                const fullCopyText = isAudioTrack 
                    ? AVSAudioInfoToCopyFormat(track.avsDetails as AVSAudioInfo, trackId)
                    : AVSVideoInfoToCopyFormat(track.avsDetails as AVSVideoInfo, trackId);
                // 移除第一行（ID行）
                const lines = fullCopyText.split('\n');
                const copyTextWithoutId = lines.slice(1).join('\n');
                avsDetailsList.push(copyTextWithoutId);
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
            this.showCopyNotification('已复制 track 信息');
        }).catch(err => {
            console.error('复制失败:', err);
            this.showCopyNotification('复制失败');
        });
    }

    // 复制 track 信息为BBCode格式的方法
    public copyTrackInfoBBCode(): void {
        // 获取隐藏格式选项状态
        const hiddenFormatCheckbox = document.getElementById('hiddenFormat_isobmff') as HTMLInputElement;
        const useHiddenFormat = hiddenFormatCheckbox?.checked || false;
        
        // 收集有 avsDetails 的 track 信息
        const avsDetailsList: string[] = [];
        
        for (const [trackId, track] of this.tracks) {
            if (track.avsDetails) {
                // 根据 track 类型选择正确的格式化函数
                const isAudioTrack = track.type === 'audio';
                const fullCopyText = isAudioTrack 
                    ? AVSAudioInfoToCopyFormat(track.avsDetails as AVSAudioInfo, trackId)
                    : AVSVideoInfoToCopyFormat(track.avsDetails as AVSVideoInfo, trackId);
                // 移除第一行（ID行）
                const lines = fullCopyText.split('\n');
                const copyTextWithoutId = lines.slice(1).join('\n');
                avsDetailsList.push(copyTextWithoutId);
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

        // 重置内部状态
        this.tracks.clear();
        this.sampleDataMap.clear();
        this.mediaInfo = null;
        this.mp4boxFile = null;
        this.avs2Analyzer = null;
        this.avs3Analyzer = null;
        this.av3aAnalyzer = null;
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