import { FRAME_RATES } from './avs-video-common.js';

const AVS1_FRAME_RATES = FRAME_RATES.slice(0, 9);

/**
 * AVS1 Profile definitions (corrected based on standard)
 */
export enum AVS1Profile {
    JIZHUN = 0x20,      // 基准档次
    SHENZHAN = 0x24,    // 伸展档次  
    YIDONG = 0x32,      // 移动档次
    JIAQIANG = 0x40,     // 加强档次
    GUANGBO = 0x48      // 广播档次
}

/**
 * AVS1 Level definitions
 */
export enum AVS1Level {
    FORBIDDEN = 0x00,        // 禁止
    LEVEL_1_0_0_08_07 = 0x04, // 1.0.0.08.07
    LEVEL_1_0_0_08_15 = 0x06, // 1.0.0.08.15
    LEVEL_1_0_0_08_30 = 0x08, // 1.0.0.08.30
    LEVEL_2_0_0_08_30 = 0x10, // 2.0.0.08.30
    LEVEL_2_1_0_08_15 = 0x12, // 2.1.0.08.15
    LEVEL_2_1_0_08_30 = 0x14, // 2.1.0.08.30
    LEVEL_4_0_0_08_30 = 0x20, // 4.0.0.08.30
    LEVEL_4_2_0_08_30 = 0x22, // 4.2.0.08.30
    LEVEL_4_0_0_10_30 = 0x24, // 4.0.0.10.30
    LEVEL_4_0_0_12_30 = 0x26, // 4.0.0.12.30
    LEVEL_4_0_2_08_60 = 0x2A, // 4.0.2.08.60
    LEVEL_6_0_0_08_60 = 0x40, // 6.0.0.08.60
    LEVEL_6_0_1_08_60 = 0x41, // 6.0.1.08.60
    LEVEL_6_2_0_08_60 = 0x42, // 6.2.0.08.60
    LEVEL_6_0_3_08_60 = 0x44, // 6.0.3.08.60
    LEVEL_6_0_5_08_60 = 0x46  // 6.0.5.08.60
}

export class AVS1Utils {
    /**
     * Get AVS1 profile name
     */
    static getProfileName(profile: number): string {
        switch (profile) {
            case AVS1Profile.JIZHUN: return '基准档次 (Jizhun Profile)';
            case AVS1Profile.SHENZHAN: return '伸展档次 (Shenzhan Profile)';
            case AVS1Profile.YIDONG: return '移动档次 (Yidong Profile)';
            case AVS1Profile.JIAQIANG: return '加强档次 (Jiaqiang Profile)';
            case AVS1Profile.GUANGBO: return '广播档次 (Broadcasting Profile)'
            default: return `Unknown Profile (0x${profile.toString(16)})`;
        }
    }

    /**
     * Get level name
     */
    static getLevelName(level: number): string {
        switch (level) {
            case AVS1Level.FORBIDDEN: return 'Forbidden';
            case AVS1Level.LEVEL_1_0_0_08_07: return '1.0.0.08.07';
            case AVS1Level.LEVEL_1_0_0_08_15: return '1.0.0.08.15';
            case AVS1Level.LEVEL_1_0_0_08_30: return '1.0.0.08.30';
            case AVS1Level.LEVEL_2_0_0_08_30: return '2.0.0.08.30';
            case AVS1Level.LEVEL_2_1_0_08_15: return '2.1.0.08.15';
            case AVS1Level.LEVEL_2_1_0_08_30: return '2.1.0.08.30';
            case AVS1Level.LEVEL_4_0_0_08_30: return '4.0.0.08.30';
            case AVS1Level.LEVEL_4_2_0_08_30: return '4.2.0.08.30';
            case AVS1Level.LEVEL_4_0_0_10_30: return '4.0.0.10.30';
            case AVS1Level.LEVEL_4_0_0_12_30: return '4.0.0.12.30';
            case AVS1Level.LEVEL_4_0_2_08_60: return '4.0.2.08.60';
            case AVS1Level.LEVEL_6_0_0_08_60: return '6.0.0.08.60';
            case AVS1Level.LEVEL_6_0_1_08_60: return '6.0.1.08.60';
            case AVS1Level.LEVEL_6_2_0_08_60: return '6.2.0.08.60';
            case AVS1Level.LEVEL_6_0_3_08_60: return '6.0.3.08.60';
            case AVS1Level.LEVEL_6_0_5_08_60: return '6.0.5.08.60';
            default: return `Unknown Level (0x${level.toString(16)})`;
        }
    }

    /**
     * Get bit depth from sample precision according to AVS1 standard
     */
    static getBitDepthFromSamplePrecision(sample_precision: number): { luma_bit_depth: number, chroma_bit_depth: number } {
        switch (sample_precision) {
            case 0: return { luma_bit_depth: -1, chroma_bit_depth: -1 }; // 禁止
            case 1: return { luma_bit_depth: 8, chroma_bit_depth: 8 }; // 8bit
            case 2: return { luma_bit_depth: 0, chroma_bit_depth: 0 }; // 保留
            case 3: return { luma_bit_depth: 10, chroma_bit_depth: 10 }; // 10bit
            case 4: return { luma_bit_depth: 0, chroma_bit_depth: 0 }; // 保留
            case 5: return { luma_bit_depth: 12, chroma_bit_depth: 12 }; // 12bit
            case 6: return { luma_bit_depth: 0, chroma_bit_depth: 0 }; // 保留
            case 7: return { luma_bit_depth: 0, chroma_bit_depth: 0 }; // 保留
            default: return { luma_bit_depth: 0, chroma_bit_depth: 0 };
        }
    }

    /**
     * Convert frame rate code to actual frame rate for AVS1
     */
    static getFrameRate(frame_rate_code: number): number {
        // AVS1 supports frame rate codes 0-8 (up to 60fps)
        if (frame_rate_code < 0 || frame_rate_code >= AVS1_FRAME_RATES.length) {
            return 0;
        }
        return AVS1_FRAME_RATES[frame_rate_code];
    }
} 