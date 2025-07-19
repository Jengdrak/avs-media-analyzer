// ISO BMFF (MP4) 分析器 - 专门处理 AVS codec
import { AVSVideoInfo, AVSAudioInfo, AVSAudioInfoToDisplayItems, AVSAudioInfoToCopyFormat, AVSVideoInfoToDisplayItems, AVSVideoInfoToCopyFormat } from './avs-info.js';
import { AVS2Analyzer } from './avs2-analyzer.js';
import { AVS3Analyzer } from './avs3-analyzer.js';

// MP4 track 信息接口
interface MP4TrackInfo {
    id: number;
    type: string; // 'video' 或 'audio'
    codec: string; // FourCC
    codecInfo?: {
        name: string;
        type: string;
    };
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

    // FourCC 到编码格式的映射表 (基于 FFmpeg ff_codec_movvideo_tags 和 ff_codec_movaudio_tags)
    private static readonly FOURCC_CODEC_MAP = new Map<string, { name: string; type: string }>([
        // 视频编码格式
        ['raw ', { name: 'Uncompressed RGB', type: 'Video' }],
        ['yuv2', { name: 'Uncompressed YUV422', type: 'Video' }],
        ['2vuy', { name: 'UNCOMPRESSED 8BIT 4:2:2', type: 'Video' }],
        ['yuvs', { name: 'same as 2vuy but byte swapped', type: 'Video' }],
        ['L555', { name: 'Uncompressed RGB 555', type: 'Video' }],
        ['L565', { name: 'Uncompressed RGB 565', type: 'Video' }],
        ['B565', { name: 'Uncompressed RGB 565 BE', type: 'Video' }],
        ['24BG', { name: 'Uncompressed 24-bit BGR', type: 'Video' }],
        ['BGRA', { name: 'Uncompressed BGRA', type: 'Video' }],
        ['RGBA', { name: 'Uncompressed RGBA', type: 'Video' }],
        ['ABGR', { name: 'Uncompressed ABGR', type: 'Video' }],
        ['b16g', { name: 'Uncompressed 16-bit grayscale', type: 'Video' }],
        ['b48r', { name: 'Uncompressed 48-bit RGB', type: 'Video' }],
        ['bxbg', { name: 'Uncompressed big-endian BGR', type: 'Video' }],
        ['bxrg', { name: 'Uncompressed big-endian RGB', type: 'Video' }],
        ['bxyv', { name: 'Uncompressed big-endian YUV', type: 'Video' }],
        ['NO16', { name: 'Uncompressed 16-bit', type: 'Video' }],
        ['DVOO', { name: 'Digital Voodoo SD 8 Bit', type: 'Video' }],
        ['R420', { name: 'Radius DV YUV PAL', type: 'Video' }],
        ['R411', { name: 'Radius DV YUV NTSC', type: 'Video' }],
        ['R10k', { name: 'UNCOMPRESSED 10BIT RGB', type: 'Video' }],
        ['R10g', { name: 'UNCOMPRESSED 10BIT RGB', type: 'Video' }],
        ['r210', { name: 'UNCOMPRESSED 10BIT RGB', type: 'Video' }],
        ['AVUI', { name: 'AVID Uncompressed deinterleaved UYVY422', type: 'Video' }],
        ['AVrp', { name: 'Avid 1:1 10-bit RGB Packer', type: 'Video' }],
        ['SUDS', { name: 'Avid DS Uncompressed', type: 'Video' }],
        ['v210', { name: 'UNCOMPRESSED 10BIT 4:2:2', type: 'Video' }],
        ['bxy2', { name: 'BOXX 10BIT 4:2:2', type: 'Video' }],
        ['v308', { name: 'UNCOMPRESSED 8BIT 4:4:4', type: 'Video' }],
        ['v408', { name: 'UNCOMPRESSED 8BIT 4:4:4:4', type: 'Video' }],
        ['v410', { name: 'UNCOMPRESSED 10BIT 4:4:4', type: 'Video' }],
        ['Y41P', { name: 'UNCOMPRESSED 12BIT 4:1:1', type: 'Video' }],
        ['yuv4', { name: 'libquicktime packed yuv420p', type: 'Video' }],
        ['Y216', { name: 'Targa Y216', type: 'Video' }],
        
        ['jpeg', { name: 'PhotoJPEG', type: 'Video' }],
        ['mjpa', { name: 'Motion-JPEG (format A)', type: 'Video' }],
        ['AVDJ', { name: 'MJPEG with alpha-channel (AVID JFIF meridien compressed)', type: 'Video' }],
        ['dmb1', { name: 'Motion JPEG OpenDML', type: 'Video' }],
        ['mjpb', { name: 'Motion-JPEG (format B)', type: 'Video' }],
        
        ['SVQ1', { name: 'Sorenson Video v1', type: 'Video' }],
        ['svq1', { name: 'Sorenson Video v1', type: 'Video' }],
        ['svqi', { name: 'Sorenson Video v1 (from QT specs)', type: 'Video' }],
        ['SVQ3', { name: 'Sorenson Video v3', type: 'Video' }],
        
        ['mp4v', { name: 'MPEG-4 Visual', type: 'Video' }],
        ['DIVX', { name: 'OpenDiVX', type: 'Video' }],
        ['XVID', { name: 'Xvid', type: 'Video' }],
        ['3IV2', { name: '3IVX', type: 'Video' }],
        
        ['h263', { name: 'H.263', type: 'Video' }],
        ['s263', { name: 'H.263', type: 'Video' }],
        
        ['dvcp', { name: 'DV PAL', type: 'Video' }],
        ['dvc ', { name: 'DV NTSC', type: 'Video' }],
        ['dvpp', { name: 'DVCPRO PAL produced by FCP', type: 'Video' }],
        ['dv5p', { name: 'DVCPRO50 PAL produced by FCP', type: 'Video' }],
        ['dv5n', { name: 'DVCPRO50 NTSC produced by FCP', type: 'Video' }],
        ['AVdv', { name: 'AVID DV', type: 'Video' }],
        ['AVd1', { name: 'AVID DV100', type: 'Video' }],
        ['dvhq', { name: 'DVCPRO HD 720p50', type: 'Video' }],
        ['dvhp', { name: 'DVCPRO HD 720p60', type: 'Video' }],
        ['dvh1', { name: 'DVCPRO HD', type: 'Video' }],
        ['dvh2', { name: 'DVCPRO HD', type: 'Video' }],
        ['dvh4', { name: 'DVCPRO HD', type: 'Video' }],
        ['dvh5', { name: 'DVCPRO HD 50i produced by FCP', type: 'Video' }],
        ['dvh6', { name: 'DVCPRO HD 60i produced by FCP', type: 'Video' }],
        ['dvh3', { name: 'DVCPRO HD 30p produced by FCP', type: 'Video' }],
        
        ['VP31', { name: 'On2 VP3', type: 'Video' }],
        ['rpza', { name: 'Apple Video (RPZA)', type: 'Video' }],
        ['cvid', { name: 'Cinepak', type: 'Video' }],
        ['8BPS', { name: 'Planar RGB (8BPS)', type: 'Video' }],
        ['smc ', { name: 'Apple Graphics (SMC)', type: 'Video' }],
        ['rle ', { name: 'Apple Animation (RLE)', type: 'Video' }],
        ['WRLE', { name: 'Microsoft RLE', type: 'Video' }],
        ['qdrw', { name: 'QuickDraw', type: 'Video' }],
        ['WRAW', { name: 'Uncompressed', type: 'Video' }],
        
        ['avc1', { name: 'H.264/AVC', type: 'Video' }],
        ['ai5p', { name: 'AVC-Intra 50M 720p24/30/60', type: 'Video' }],
        ['ai5q', { name: 'AVC-Intra 50M 720p25/50', type: 'Video' }],
        ['ai52', { name: 'AVC-Intra 50M 1080p25/50', type: 'Video' }],
        ['ai53', { name: 'AVC-Intra 50M 1080p24/30/60', type: 'Video' }],
        ['ai55', { name: 'AVC-Intra 50M 1080i50', type: 'Video' }],
        ['ai56', { name: 'AVC-Intra 50M 1080i60', type: 'Video' }],
        ['ai1p', { name: 'AVC-Intra 100M 720p24/30/60', type: 'Video' }],
        ['ai1q', { name: 'AVC-Intra 100M 720p25/50', type: 'Video' }],
        ['ai12', { name: 'AVC-Intra 100M 1080p25/50', type: 'Video' }],
        ['ai13', { name: 'AVC-Intra 100M 1080p24/30/60', type: 'Video' }],
        ['ai15', { name: 'AVC-Intra 100M 1080i50', type: 'Video' }],
        ['ai16', { name: 'AVC-Intra 100M 1080i60', type: 'Video' }],
        
        ['hev1', { name: 'H.265/HEVC', type: 'Video' }],
        ['hvc1', { name: 'H.265/HEVC', type: 'Video' }],
        
        ['m1v1', { name: 'Apple MPEG-1 Camcorder', type: 'Video' }],
        ['mpeg', { name: 'MPEG-1', type: 'Video' }],
        ['m1v ', { name: 'MPEG-1', type: 'Video' }],
        ['m2v1', { name: 'Apple MPEG-2 Camcorder', type: 'Video' }],
        ['hdv1', { name: 'MPEG2 HDV 720p30', type: 'Video' }],
        ['hdv2', { name: 'MPEG2 HDV 1080i60', type: 'Video' }],
        ['hdv3', { name: 'MPEG2 HDV 1080i50', type: 'Video' }],
        ['hdv4', { name: 'MPEG2 HDV 720p24', type: 'Video' }],
        ['hdv5', { name: 'MPEG2 HDV 720p25', type: 'Video' }],
        ['hdv6', { name: 'MPEG2 HDV 1080p24', type: 'Video' }],
        ['hdv7', { name: 'MPEG2 HDV 1080p25', type: 'Video' }],
        ['hdv8', { name: 'MPEG2 HDV 1080p30', type: 'Video' }],
        ['hdv9', { name: 'MPEG2 HDV 720p60 JVC', type: 'Video' }],
        ['hdva', { name: 'MPEG2 HDV 720p50', type: 'Video' }],
        ['mx5n', { name: 'MPEG2 IMX NTSC 525/60 50mb/s produced by FCP', type: 'Video' }],
        ['mx5p', { name: 'MPEG2 IMX PAL 625/50 50mb/s produced by FCP', type: 'Video' }],
        ['mx4n', { name: 'MPEG2 IMX NTSC 525/60 40mb/s produced by FCP', type: 'Video' }],
        ['mx4p', { name: 'MPEG2 IMX PAL 625/50 40mb/s produced by FCP', type: 'Video' }],
        ['mx3n', { name: 'MPEG2 IMX NTSC 525/60 30mb/s produced by FCP', type: 'Video' }],
        ['mx3p', { name: 'MPEG2 IMX PAL 625/50 30mb/s produced by FCP', type: 'Video' }],
        ['xd54', { name: 'XDCAM HD422 720p24 CBR', type: 'Video' }],
        ['xd55', { name: 'XDCAM HD422 720p25 CBR', type: 'Video' }],
        ['xd59', { name: 'XDCAM HD422 720p60 CBR', type: 'Video' }],
        ['xd5a', { name: 'XDCAM HD422 720p50 CBR', type: 'Video' }],
        ['xd5b', { name: 'XDCAM HD422 1080i60 CBR', type: 'Video' }],
        ['xd5c', { name: 'XDCAM HD422 1080i50 CBR', type: 'Video' }],
        ['xd5d', { name: 'XDCAM HD422 1080p24 CBR', type: 'Video' }],
        ['xd5e', { name: 'XDCAM HD422 1080p25 CBR', type: 'Video' }],
        ['xd5f', { name: 'XDCAM HD422 1080p30 CBR', type: 'Video' }],
        ['xdv1', { name: 'XDCAM EX 720p30 VBR', type: 'Video' }],
        ['xdv2', { name: 'XDCAM HD 1080i60', type: 'Video' }],
        ['xdv3', { name: 'XDCAM HD 1080i50 VBR', type: 'Video' }],
        ['xdv4', { name: 'XDCAM EX 720p24 VBR', type: 'Video' }],
        ['xdv5', { name: 'XDCAM EX 720p25 VBR', type: 'Video' }],
        ['xdv6', { name: 'XDCAM HD 1080p24 VBR', type: 'Video' }],
        ['xdv7', { name: 'XDCAM HD 1080p25 VBR', type: 'Video' }],
        ['xdv8', { name: 'XDCAM HD 1080p30 VBR', type: 'Video' }],
        ['xdv9', { name: 'XDCAM EX 720p60 VBR', type: 'Video' }],
        ['xdva', { name: 'XDCAM EX 720p50 VBR', type: 'Video' }],
        ['xdvb', { name: 'XDCAM EX 1080i60 VBR', type: 'Video' }],
        ['xdvc', { name: 'XDCAM EX 1080i50 VBR', type: 'Video' }],
        ['xdvd', { name: 'XDCAM EX 1080p24 VBR', type: 'Video' }],
        ['xdve', { name: 'XDCAM EX 1080p25 VBR', type: 'Video' }],
        ['xdvf', { name: 'XDCAM EX 1080p30 VBR', type: 'Video' }],
        ['xdhd', { name: 'XDCAM HD 540p', type: 'Video' }],
        ['xdh2', { name: 'XDCAM HD422 540p', type: 'Video' }],
        ['AVmp', { name: 'AVID IMX PAL', type: 'Video' }],
        
        ['mjp2', { name: 'JPEG 2000 produced by FCP', type: 'Video' }],
        ['tga ', { name: 'Truevision Targa', type: 'Video' }],
        ['tiff', { name: 'TIFF embedded in MOV', type: 'Video' }],
        ['gif ', { name: 'embedded gif files', type: 'Video' }],
        ['png ', { name: 'PNG', type: 'Video' }],
        ['MNG ', { name: 'MNG', type: 'Video' }],
        
        ['vc-1', { name: 'SMPTE RP 2025', type: 'Video' }],
        ['avs2', { name: 'AVS2', type: 'Video' }],
        ['drac', { name: 'Dirac', type: 'Video' }],
        ['AVdn', { name: 'AVID DNxHD', type: 'Video' }],
        ['3IVD', { name: '3ivx DivX Doctor', type: 'Video' }],
        ['AV1x', { name: 'AVID 1:1x', type: 'Video' }],
        ['AVup', { name: 'AVID', type: 'Video' }],
        ['sgi ', { name: 'SGI', type: 'Video' }],
        ['dpx ', { name: 'DPX', type: 'Video' }],
        ['exr ', { name: 'OpenEXR', type: 'Video' }],
        
        ['apch', { name: 'Apple ProRes 422 High Quality', type: 'Video' }],
        ['apcn', { name: 'Apple ProRes 422 Standard Definition', type: 'Video' }],
        ['apcs', { name: 'Apple ProRes 422 LT', type: 'Video' }],
        ['apco', { name: 'Apple ProRes 422 Proxy', type: 'Video' }],
        ['ap4h', { name: 'Apple ProRes 4444', type: 'Video' }],
        ['flic', { name: 'FLI/FLC animation', type: 'Video' }],
        
        // AVS系列特殊处理
        ['avst', { name: 'AVS2', type: 'Video' }],
        ['avs3', { name: 'AVS3', type: 'Video' }],
        
        // 音频编码格式
        ['mp4a', { name: 'AAC', type: 'Audio' }],
        ['ac-3', { name: 'AC-3', type: 'Audio' }],
        ['sac3', { name: 'AC-3 (Nero Recode)', type: 'Audio' }],
        ['ima4', { name: 'IMA ADPCM', type: 'Audio' }],
        ['alac', { name: 'Apple Lossless', type: 'Audio' }],
        ['samr', { name: 'AMR-NB 3gp', type: 'Audio' }],
        ['sawb', { name: 'AMR-WB 3gp', type: 'Audio' }],
        ['dtsc', { name: 'DTS formats prior to DTS-HD', type: 'Audio' }],
        ['dtsh', { name: 'DTS-HD audio formats', type: 'Audio' }],
        ['dtsl', { name: 'DTS-HD Lossless formats', type: 'Audio' }],
        ['DTS ', { name: 'DTS (non-standard)', type: 'Audio' }],
        ['ec-3', { name: 'E-AC-3', type: 'Audio' }],
        ['vdva', { name: 'DV Audio', type: 'Audio' }],
        ['dvca', { name: 'DV Audio', type: 'Audio' }],
        ['agsm', { name: 'GSM', type: 'Audio' }],
        ['ilbc', { name: 'iLBC', type: 'Audio' }],
        ['MAC3', { name: 'MACE 3:1', type: 'Audio' }],
        ['MAC6', { name: 'MACE 6:1', type: 'Audio' }],
        ['.mp1', { name: 'MPEG-1 Audio Layer I', type: 'Audio' }],
        ['.mp2', { name: 'MPEG-1 Audio Layer II', type: 'Audio' }],
        ['.mp3', { name: 'MPEG-1 Audio Layer III', type: 'Audio' }],
        ['nmos', { name: 'Nellymoser (Flash Media Server)', type: 'Audio' }],
        ['alaw', { name: 'A-law PCM', type: 'Audio' }],
        ['fl32', { name: '32-bit float PCM', type: 'Audio' }],
        ['fl64', { name: '64-bit float PCM', type: 'Audio' }],
        ['ulaw', { name: 'μ-law PCM', type: 'Audio' }],
        ['twos', { name: '16-bit BE PCM', type: 'Audio' }],
        ['sowt', { name: '16-bit LE PCM', type: 'Audio' }],
        ['lpcm', { name: '16-bit LE PCM', type: 'Audio' }],
        ['in24', { name: '24-bit PCM', type: 'Audio' }],
        ['in32', { name: '32-bit PCM', type: 'Audio' }],
        ['raw ', { name: '8-bit unsigned PCM', type: 'Audio' }],
        ['NONE', { name: '8-bit unsigned PCM', type: 'Audio' }],
        ['Qclp', { name: 'QCELP', type: 'Audio' }],
        ['Qclq', { name: 'QCELP', type: 'Audio' }],
        ['sqcp', { name: 'QCELP (ISO Media fourcc)', type: 'Audio' }],
        ['QDM2', { name: 'QDesign Music Codec 2', type: 'Audio' }],
        ['QDMC', { name: 'QDesign Music Codec', type: 'Audio' }],
        ['spex', { name: 'Speex (Flash Media Server)', type: 'Audio' }],
        ['WMA2', { name: 'Windows Media Audio 2', type: 'Audio' }],
        
        // Audio Vivid 特殊处理
        ['av3a', { name: 'Audio Vivid', type: 'Audio' }],
        
        // 字幕编码格式 (ff_codec_movsubtitle_tags)
        ['text', { name: 'QuickTime Text', type: 'Subtitle' }],
        ['tx3g', { name: '3GPP Timed Text', type: 'Subtitle' }],
        ['c608', { name: 'EIA-608 Closed Captions', type: 'Subtitle' }],
    ]);

    constructor() {
        // 初始化
    }

    // 获取 FourCC 对应的编码器信息
    private getCodecInfo(fourCC: string): { name: string; type: string } {
        // 先查找映射表
        const codecInfo = ISOMBFFAnalyzer.FOURCC_CODEC_MAP.get(fourCC);
        if (codecInfo) {
            return codecInfo;
        }
        
        // 如果映射表中没有，返回原始 FourCC
        return { 
            name: `Unknown (${fourCC})`, 
            type: 'Unknown' 
        };
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
                
                if (pendingTracks.size > 0) {
                    console.log(`开始为${pendingTracks.size}个目标codec track提取sample`);
                    this.mp4boxFile.start();
                }
                
                // 标记MOOV已解析完成
                moovParsed = true;
                
                // 如果没有需要解析的track，直接结束
                if (pendingTracks.size === 0) {
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
                        
                        // 文件读取完成后，如果有目标tracks，现在才启动sample提取
                        if (pendingTracks.size > 0) {
                            console.log(`文件读取完成，开始为 ${pendingTracks.size} 个目标 codec track 提取样本`);
                            try {
                                this.mp4boxFile.start();
                            } catch (error) {
                                console.error('启动sample提取失败:', error);
                                resolve(); // 即使失败也继续，不阻塞流程
                            }
                        } else {
                            resolve();
                        }
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
            
            // 获取编码器信息
            const codecInfo = this.getCodecInfo(fourCC);
            
            const trackInfo: MP4TrackInfo = {
                id: track.id,
                type: correctedType,
                codec: fourCC,
                codecInfo: codecInfo
            };
            
            this.tracks.set(track.id, trackInfo);
            
            console.log(`📺 Track ${track.id}: ${trackInfo.type} - ${codecInfo.name} (${fourCC})`);
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
                    <h3>Tracks 信息</h3>
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
                                <th>流类型</th>
                                <th>编码格式</th>
                                <th>格式标识符</th>
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
                    <td colspan="4" style="text-align: center; padding: 20px; color: #666;">
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
                                ${track.codecInfo?.name || track.codec}
                            </div>
                            ${track.avsDetails ? `<button class="toggle-details-btn" onclick="toggleDetails('avs-info-${trackId}')">⏬</button>` : ''}
                        </div>
                    </td>
                    <td>${track.codec}</td>
                </tr>
            `;

            // 如果有 AVS 分析结果，添加展开行
            if (track.avsDetails) {
                html += `
                    <tr id="avs-info-${trackId}" class="avs-details-row" style="display: none;">
                        <td colspan="4">
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
                // 根据 track 类型选择正确的格式化函数，使用 trackId 作为标识符
                const isAudioTrack = track.type === 'audio';
                const copyText = isAudioTrack 
                    ? AVSAudioInfoToCopyFormat(track.avsDetails as AVSAudioInfo, trackId)
                    : AVSVideoInfoToCopyFormat(track.avsDetails as AVSVideoInfo, trackId);
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
                // 根据 track 类型选择正确的格式化函数，使用 trackId 作为标识符
                const isAudioTrack = track.type === 'audio';
                const copyText = isAudioTrack 
                    ? AVSAudioInfoToCopyFormat(track.avsDetails as AVSAudioInfo, trackId)
                    : AVSVideoInfoToCopyFormat(track.avsDetails as AVSVideoInfo, trackId);
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