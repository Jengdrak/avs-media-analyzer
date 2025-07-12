import { FRAME_RATES, ColorPrimaries, TransferCharacteristics, MatrixCoefficients } from './avs-video-common.js';

/**
 * Frame rate table for AVS3.
 */
const AVS3_FRAME_RATES = FRAME_RATES;

/**
 * AVS3 Profile definitions
 */
export enum AVS3Profile {
    FORBIDDEN = 0x00,
    MAIN_8BIT = 0x20,
    MAIN_10BIT = 0x22,
    HIGH_8BIT = 0x30,
    HIGH_10BIT = 0x32,
}

/**
 * AVS3 Level definitions
 */
export enum AVS3Level {
    FORBIDDEN = 0x00,
    LEVEL_2_0_15 = 0x10,
    LEVEL_2_0_30 = 0x12,
    LEVEL_2_0_60 = 0x14,
    LEVEL_4_0_30 = 0x20,
    LEVEL_4_0_60 = 0x22,
    LEVEL_6_0_30 = 0x40,
    LEVEL_6_4_30 = 0x41,
    LEVEL_6_2_30 = 0x42,
    LEVEL_6_6_30 = 0x43,
    LEVEL_6_0_60 = 0x44,
    LEVEL_6_4_60 = 0x45,
    LEVEL_6_2_60 = 0x46,
    LEVEL_6_6_60 = 0x47,
    LEVEL_6_0_120 = 0x48,
    LEVEL_6_4_120 = 0x49,
    LEVEL_6_2_120 = 0x4A,
    LEVEL_6_6_120 = 0x4B,
    LEVEL_8_0_30 = 0x50,
    LEVEL_8_4_30 = 0x51,
    LEVEL_8_2_30 = 0x52,
    LEVEL_8_6_30 = 0x53,
    LEVEL_8_0_60 = 0x54,
    LEVEL_8_4_60 = 0x55,
    LEVEL_8_2_60 = 0x56,
    LEVEL_8_6_60 = 0x57,
    LEVEL_8_0_120 = 0x58,
    LEVEL_8_4_120 = 0x59,
    LEVEL_8_2_120 = 0x5A,
    LEVEL_8_6_120 = 0x5B,
    LEVEL_10_0_30 = 0x60,
    LEVEL_10_4_30 = 0x61,
    LEVEL_10_2_30 = 0x62,
    LEVEL_10_6_30 = 0x63,
    LEVEL_10_0_60 = 0x64,
    LEVEL_10_4_60 = 0x65,
    LEVEL_10_2_60 = 0x66,
    LEVEL_10_6_60 = 0x67,
    LEVEL_10_0_120 = 0x68,
    LEVEL_10_4_120 = 0x69,
    LEVEL_10_2_120 = 0x6A,
    LEVEL_10_6_120 = 0x6B,
}

type BitDepthInfo = {
    luma_bit_depth: number;
    chroma_bit_depth: number;
};

export namespace AVS3Utils {
    /**
     * Get profile name by profile ID for AVS3
     */
    export function getProfileName(profileId: number): string {
        switch (profileId) {
            case AVS3Profile.FORBIDDEN: return '禁止 (Forbidden)';
            case AVS3Profile.MAIN_8BIT: return '基准8位档次 (Main 8bit Profile)';
            case AVS3Profile.MAIN_10BIT: return '基准10位档次 (Main 10bit Profile)';
            case AVS3Profile.HIGH_8BIT: return '加强8位档次 (High 8bit Profile)';
            case AVS3Profile.HIGH_10BIT: return '加强10位档次 (High 10bit Profile)';
            default: return `保留 (Reserved, 0x${profileId.toString(16)})`;
        }
    }

    /**
     * Get level name by level ID for AVS3
     */
    export function getLevelName(levelId: number): string {
        switch (levelId) {
            case AVS3Level.FORBIDDEN: return '禁止 (Forbidden)';
            case AVS3Level.LEVEL_2_0_15: return '2.0.15';
            case AVS3Level.LEVEL_2_0_30: return '2.0.30';
            case AVS3Level.LEVEL_2_0_60: return '2.0.60';
            case AVS3Level.LEVEL_4_0_30: return '4.0.30';
            case AVS3Level.LEVEL_4_0_60: return '4.0.60';
            case AVS3Level.LEVEL_6_0_30: return '6.0.30';
            case AVS3Level.LEVEL_6_4_30: return '6.4.30';
            case AVS3Level.LEVEL_6_2_30: return '6.2.30';
            case AVS3Level.LEVEL_6_6_30: return '6.6.30';
            case AVS3Level.LEVEL_6_0_60: return '6.0.60';
            case AVS3Level.LEVEL_6_4_60: return '6.4.60';
            case AVS3Level.LEVEL_6_2_60: return '6.2.60';
            case AVS3Level.LEVEL_6_6_60: return '6.6.60';
            case AVS3Level.LEVEL_6_0_120: return '6.0.120';
            case AVS3Level.LEVEL_6_4_120: return '6.4.120';
            case AVS3Level.LEVEL_6_2_120: return '6.2.120';
            case AVS3Level.LEVEL_6_6_120: return '6.6.120';
            case AVS3Level.LEVEL_8_0_30: return '8.0.30';
            case AVS3Level.LEVEL_8_4_30: return '8.4.30';
            case AVS3Level.LEVEL_8_2_30: return '8.2.30';
            case AVS3Level.LEVEL_8_6_30: return '8.6.30';
            case AVS3Level.LEVEL_8_0_60: return '8.0.60';
            case AVS3Level.LEVEL_8_4_60: return '8.4.60';
            case AVS3Level.LEVEL_8_2_60: return '8.2.60';
            case AVS3Level.LEVEL_8_6_60: return '8.6.60';
            case AVS3Level.LEVEL_8_0_120: return '8.0.120';
            case AVS3Level.LEVEL_8_4_120: return '8.4.120';
            case AVS3Level.LEVEL_8_2_120: return '8.2.120';
            case AVS3Level.LEVEL_8_6_120: return '8.6.120';
            case AVS3Level.LEVEL_10_0_30: return '10.0.30';
            case AVS3Level.LEVEL_10_4_30: return '10.4.30';
            case AVS3Level.LEVEL_10_2_30: return '10.2.30';
            case AVS3Level.LEVEL_10_6_30: return '10.6.30';
            case AVS3Level.LEVEL_10_0_60: return '10.0.60';
            case AVS3Level.LEVEL_10_4_60: return '10.4.60';
            case AVS3Level.LEVEL_10_2_60: return '10.2.60';
            case AVS3Level.LEVEL_10_6_60: return '10.6.60';
            case AVS3Level.LEVEL_10_0_120: return '10.0.120';
            case AVS3Level.LEVEL_10_4_120: return '10.4.120';
            case AVS3Level.LEVEL_10_2_120: return '10.2.120';
            case AVS3Level.LEVEL_10_6_120: return '10.6.120';
            default: return `保留 (Reserved, 0x${levelId.toString(16)})`;
        }
    }

    /**
     * Convert frame rate code to actual frame rate for AVS3
     */
    export function getFrameRate(frame_rate_code: number): number {
        if (frame_rate_code >= 0 && frame_rate_code < AVS3_FRAME_RATES.length) {
            return AVS3_FRAME_RATES[frame_rate_code];
        }
        // Reserved values return 0
        return 0;
    }

    export function getBitDepthFromPrecision(id: number): BitDepthInfo {
        switch (id) {
            case 0b000: return { luma_bit_depth: -1, chroma_bit_depth: -1 }; // Forbidden
            case 0b001: return { luma_bit_depth: 8, chroma_bit_depth: 8 }; // 8-bit
            case 0b010: return { luma_bit_depth: 10, chroma_bit_depth: 10 }; // 10-bit
            case 0b011: return { luma_bit_depth: 0, chroma_bit_depth: 0 }; // Reserved
            case 0b100: return { luma_bit_depth: 0, chroma_bit_depth: 0 }; // Reserved
            case 0b101: return { luma_bit_depth: 0, chroma_bit_depth: 0 }; // Reserved
            case 0b110: return { luma_bit_depth: 0, chroma_bit_depth: 0 }; // Reserved
            case 0b111: return { luma_bit_depth: 0, chroma_bit_depth: 0 }; // Reserved
            default: return { luma_bit_depth: 0, chroma_bit_depth: 0 };
        }
    }

     /**
     * Validates and returns the ColorPrimaries enum for AVS3.
     * @param primaries The numeric code.
     * @returns The enum value, or null if forbidden.
     */
     export function getColorPrimaries(primaries: number): ColorPrimaries | null {
        if (primaries === 0) {
            return null;
        }
        return primaries as ColorPrimaries;
    }

    /**
     * Validates and returns the TransferCharacteristics enum for AVS3.
     * @param characteristics The numeric code.
     * @returns The enum value, or null if reserved.
     */
    export function getTransferCharacteristics(characteristics: number): TransferCharacteristics | null {
        if (characteristics === 0) {
            return null;
        }
        if (characteristics == 13) {
            return TransferCharacteristics.RESERVED;
        }
        return characteristics as TransferCharacteristics;
    }

    /**
     * Validates and returns the MatrixCoefficients enum for AVS3.
     * @param coefficients The numeric code.
     * @returns The enum value, or null if reserved.
     */
    export function getMatrixCoefficients(coefficients: number): MatrixCoefficients | null {
        if (coefficients === 0) {
            return null;
        }
        if (coefficients > 9) {
            return MatrixCoefficients.RESERVED;
        }
        return coefficients as MatrixCoefficients;
    }
}
