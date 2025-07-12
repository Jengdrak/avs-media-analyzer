import { FRAME_RATES } from './avs-video-common.js';

/**
 * Extended frame rate table for AVS2, including new codes.
 */
const AVS2_FRAME_RATES = FRAME_RATES.slice(0, 14);


/**
 * AVS2 Profile definitions
 */
export enum AVS2Profile {
    FORBIDDEN = 0x00,
    MAIN_8BIT_PICTURE = 0x10,
    MAIN_8BIT_444_PICTURE = 0x11,
    MAIN_PICTURE = 0x12,
    MAIN = 0x20,
    MAIN_444 = 0x21,
    MAIN_10BIT = 0x22,
    MAIN_10BIT_444 = 0x23,
    MAIN_12BIT_444 = 0x25,
    MAIN_16BIT_444 = 0x27,
    MAIN_MV = 0x28,
    MAIN_MV_10BIT = 0x2A,
    ADVANCED_SCENE = 0x30,
    SCREEN_CONTENT_8BIT_444 = 0x31,
    ADVANCED_SCENE_10BIT = 0x32,
    MAIN_3D = 0x68,
    MAIN_3D_10BIT = 0x6A,
    LOSSLESS_16BIT_444 = 0xB7,
}

/**
 * AVS2 Level definitions
 */
export enum AVS2Level {
    FORBIDDEN = 0x00,
    LEVEL_2_0_15 = 0x10,
    LEVEL_2_0_30 = 0x12,
    LEVEL_2_0_60 = 0x14,
    LEVEL_4_0_30 = 0x20,
    LEVEL_4_0_60 = 0x22,
    LEVEL_6_0_30 = 0x40,
    LEVEL_6_2_30 = 0x42,
    LEVEL_6_0_60 = 0x44,
    LEVEL_6_2_60 = 0x46,
    LEVEL_6_0_120 = 0x48,
    LEVEL_6_2_120 = 0x4A,
    LEVEL_8_0_30 = 0x50,
    LEVEL_8_2_30 = 0x52,
    LEVEL_8_0_60 = 0x54,
    LEVEL_8_2_60 = 0x56,
    LEVEL_8_0_120 = 0x58,
    LEVEL_8_2_120 = 0x5A,
    LEVEL_10_0_30 = 0x60,
    LEVEL_10_2_30 = 0x62,
    LEVEL_10_0_60 = 0x64,
    LEVEL_10_2_60 = 0x66,
    LEVEL_10_0_120 = 0x68,
    LEVEL_10_2_120 = 0x6A,
}

type BitDepthInfo = {
    luma_bit_depth: number;
    chroma_bit_depth: number;
};

export namespace AVS2Utils {
    export function getProfileName(profileId: number): string {
        switch (profileId) {
            case AVS2Profile.FORBIDDEN: return '禁止 (Forbidden)';
            case AVS2Profile.MAIN_8BIT_PICTURE: return '基准8位图像档次 (Main-8bit Picture Profile)';
            case AVS2Profile.MAIN_8BIT_444_PICTURE: return '基准8位4:4:4图像档次 (Main-8bit 4:4:4 Picture Profile)';
            case AVS2Profile.MAIN_PICTURE: return '基准图像档次 (Main Picture Profile)';
            case AVS2Profile.MAIN: return '基准8位档次 (Main Profile)';
            case AVS2Profile.MAIN_444: return '基准8位4:4:4档次 (Main 4:4:4 Profile)';
            case AVS2Profile.MAIN_10BIT: return '基准10位档次 (Main-10bit Profile)';
            case AVS2Profile.MAIN_10BIT_444: return '基准10位4:4:4档次 (Main-10bit 4:4:4 Profile)';
            case AVS2Profile.MAIN_12BIT_444: return '基准12位4:4:4档次 (Main-12bit 4:4:4 Profile)';
            case AVS2Profile.MAIN_16BIT_444: return '基准16位4:4:4档次 (Main-16bit 4:4:4 Profile)';
            case AVS2Profile.MAIN_MV: return '基准8位多视档次 (Main-MV Profile)';
            case AVS2Profile.MAIN_MV_10BIT: return '基准10位多视档次 (Main-MV 10bit Profile)';
            case AVS2Profile.ADVANCED_SCENE: return '高级场景8位档次 (Advanced Scene Profile)';
            case AVS2Profile.SCREEN_CONTENT_8BIT_444: return '高级8位4:4:4视频 (Screen Content 8bit 4:4:4 Profile)';
            case AVS2Profile.ADVANCED_SCENE_10BIT: return '高级场景10位档次 (Advanced Scene-10bit Profile)';
            case AVS2Profile.MAIN_3D: return '基准8位3D档次 (Main-3D Profile)';
            case AVS2Profile.MAIN_3D_10BIT: return '基准10位3D档次 (Main-3D 10bit Profile)';
            case AVS2Profile.LOSSLESS_16BIT_444: return '无损16位4:4:4档次 (Lossless 16bit 4:4:4 Profile)';
            default: return `保留 (Reserved, 0x${profileId.toString(16)})`;
        }
    }

    export function getLevelName(levelId: number): string {
        switch (levelId) {
            case AVS2Level.FORBIDDEN: return '禁止 (Forbidden)';
            case AVS2Level.LEVEL_2_0_15: return '2.0.15';
            case AVS2Level.LEVEL_2_0_30: return '2.0.30';
            case AVS2Level.LEVEL_2_0_60: return '2.0.60';
            case AVS2Level.LEVEL_4_0_30: return '4.0.30';
            case AVS2Level.LEVEL_4_0_60: return '4.0.60';
            case AVS2Level.LEVEL_6_0_30: return '6.0.30';
            case AVS2Level.LEVEL_6_2_30: return '6.2.30';
            case AVS2Level.LEVEL_6_0_60: return '6.0.60';
            case AVS2Level.LEVEL_6_2_60: return '6.2.60';
            case AVS2Level.LEVEL_6_0_120: return '6.0.120';
            case AVS2Level.LEVEL_6_2_120: return '6.2.120';
            case AVS2Level.LEVEL_8_0_30: return '8.0.30';
            case AVS2Level.LEVEL_8_2_30: return '8.2.30';
            case AVS2Level.LEVEL_8_0_60: return '8.0.60';
            case AVS2Level.LEVEL_8_2_60: return '8.2.60';
            case AVS2Level.LEVEL_8_0_120: return '8.0.120';
            case AVS2Level.LEVEL_8_2_120: return '8.2.120';
            case AVS2Level.LEVEL_10_0_30: return '10.0.30';
            case AVS2Level.LEVEL_10_2_30: return '10.2.30';
            case AVS2Level.LEVEL_10_0_60: return '10.0.60';
            case AVS2Level.LEVEL_10_2_60: return '10.2.60';
            case AVS2Level.LEVEL_10_0_120: return '10.0.120';
            case AVS2Level.LEVEL_10_2_120: return '10.2.120';
            default: return `保留 (Reserved, 0x${levelId.toString(16)})`;
        }
    }
    
    export function getFrameRate(frame_rate_code: number): number {
        if (frame_rate_code >= 0 && frame_rate_code < AVS2_FRAME_RATES.length) {
            return AVS2_FRAME_RATES[frame_rate_code];
        }
        // Reserved values return 0
        return 0;
    }

    export function getBitDepthFromPrecision(id: number): BitDepthInfo {
        switch (id) {
            case 0b000: return { luma_bit_depth: -1, chroma_bit_depth: -1 }; // Forbidden
            case 0b001: return { luma_bit_depth: 8, chroma_bit_depth: 8 }; // 8-bit
            case 0b010: return { luma_bit_depth: 10, chroma_bit_depth: 10 }; // 10-bit
            case 0b011: return { luma_bit_depth: 12, chroma_bit_depth: 12 }; // 12-bit
            case 0b100: return { luma_bit_depth: 0, chroma_bit_depth: 0 }; // Reserved
            case 0b101: return { luma_bit_depth: 16, chroma_bit_depth: 16 }; // 16-bit
            case 0b110: return { luma_bit_depth: 0, chroma_bit_depth: 0 }; // Reserved
            case 0b111: return { luma_bit_depth: 0, chroma_bit_depth: 0 }; // Reserved
            default: return { luma_bit_depth: 0, chroma_bit_depth: 0 };
        }
    }
} 