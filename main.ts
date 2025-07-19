// 主入口文件 - 负责文件类型判断和分发
import { TSAnalyzer } from './ts-analyzer.js';
import { GenericMediaAnalyzer } from './generic-media-analyzer.js';
import { ISOMBFFAnalyzer } from './isobmff-analyzer.js';

class MainAnalyzer {
    private tsAnalyzer: TSAnalyzer;
    private genericAnalyzer: GenericMediaAnalyzer;
    private isobmffAnalyzer: ISOMBFFAnalyzer;

    constructor() {
        this.tsAnalyzer = new TSAnalyzer();
        this.genericAnalyzer = new GenericMediaAnalyzer();
        this.isobmffAnalyzer = new ISOMBFFAnalyzer();
        this.initializeEventListeners();
    }

    // 文件类型检测函数
    private isTransportStream(file: File): boolean {
        const extension = file.name.toLowerCase().split('.').pop();
        return extension === 'ts' || extension === 'm2ts';
    }

    // ISOBMFF 格式检测函数
    private isISOBMFF(file: File): boolean {
        const extension = file.name.toLowerCase().split('.').pop();
        // 支持的 ISOBMFF 格式扩展名
        const isobmffExtensions = ['mp4', 'm4v', 'm4a', 'mov', '3gp', '3g2', 'f4v', 'f4a'];
        return isobmffExtensions.includes(extension || '');
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

    // 处理文件 - 主分发逻辑
    private async handleFile(file: File): Promise<void> {
        try {
            if (this.isTransportStream(file)) {
                console.log('检测到TS/M2TS文件，使用TS分析器');
                await this.tsAnalyzer.handleFile(file);
            } else if (this.isISOBMFF(file)) {
                console.log('检测到ISOBMFF格式文件，使用ISOBMFF分析器');
                await this.isobmffAnalyzer.handleFile(file);
            } else {
                console.log('检测到通用媒体文件，使用通用分析器');
                await this.genericAnalyzer.handleFile(file);
            }
        } catch (error) {
            console.error('文件处理错误:', error);
            this.showError('文件处理失败: ' + (error as Error).message);
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
}

// 等待DOM加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    new MainAnalyzer();
});