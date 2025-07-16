// 通用媒体分析器 - 处理非TS文件
export class GenericMediaAnalyzer {
    constructor() {
        // 初始化
    }

    // 处理文件
    public async handleFile(file: File): Promise<void> {
        this.showFileInfo(file);
        this.showAnalysisSection();
        
        try {
            // 模拟分析过程
            await this.simulateAnalysis();
            
            // 显示结果
            this.showResults(file);
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
            streamCountElement.textContent = '0'; // 暂时显示0
        }
    }

    // 显示流信息
    private displayStreams(): void {
        const streamsContainer = document.getElementById('streamsContainer');
        if (!streamsContainer) return;

        // 创建通用媒体文件的流信息显示
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
                                <th>语言</th>
                                <th>描述</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td colspan="5" style="text-align: center; padding: 20px; color: #666;">
                                    暂无流信息 - 通用媒体分析功能开发中
                                </td>
                            </tr>
                        </tbody>
                    </table>
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