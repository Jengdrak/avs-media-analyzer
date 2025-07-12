/**
 * AV3A Common - Shared enums and utilities for AVS3 Audio
 */

/**
 * Audio codec ID enumeration
 */
export enum AudioCodecId {
    LOSSLESS = 1,
    GENERAL = 2
}

/**
 * Neural network type enumeration
 */
export enum NeuralNetworkType {
    BASIC = 0,
    LOW_COMPLEXITY = 1,
    Reserved
}

/**
 * Coding profile enumeration
 */
export enum CodingProfile {
    BASIC = 0,
    OBJECT_METADATA = 1,
    FOA_HOA = 2,
    Reserved
}

/**
 * Channel configuration enumeration
 */
export enum ChannelConfiguration {
    MONO = 0x0,
    STEREO = 0x1,
    MC_5_1 = 0x2,
    MC_7_1 = 0x3,
    FOA = 0x6,
    MC_5_1_2 = 0x7,
    MC_5_1_4 = 0x8,
    MC_7_1_2 = 0x9,
    MC_7_1_4 = 0xa,
    HOA_ORDER3 = 0xb,
    HOA_ORDER2 = 0xc,
    Reserved
}

/**
 * Sampling frequency mapping
 */
const SAMPLING_FREQUENCIES: Record<number, number> = {
    0x0: 192000,
    0x1: 96000,
    0x2: 48000,
    0x3: 44100
};

/**
 * Channel count mapping
 */
const CHANNEL_COUNTS: Record<ChannelConfiguration, number> = {
    [ChannelConfiguration.MONO]: 1,
    [ChannelConfiguration.STEREO]: 2,
    [ChannelConfiguration.MC_5_1]: 6,
    [ChannelConfiguration.MC_7_1]: 8,
    [ChannelConfiguration.FOA]: 4,
    [ChannelConfiguration.MC_5_1_2]: 8,
    [ChannelConfiguration.MC_5_1_4]: 10,
    [ChannelConfiguration.MC_7_1_2]: 10,
    [ChannelConfiguration.MC_7_1_4]: 12,
    [ChannelConfiguration.HOA_ORDER2]: 9,
    [ChannelConfiguration.HOA_ORDER3]: 16,
    [ChannelConfiguration.Reserved]: 0
};

/**
 * AV3A Utils namespace containing utility functions
 */
export class AV3AUtils {
    /**
     * Get sampling frequency from index
     */
    static getSamplingFrequency(index: number): number {
        return SAMPLING_FREQUENCIES[index] || 0;
    }

    /**
     * Get resolution from 2-bit value
     */
    static getResolution(value: number): number {
        switch (value) {
            case 1: return 16;
            case 2: return 24;
            default: return 0;
        }
    }

    /**
     * Get channel configuration from index
     */
    static getChannelConfiguration(index: number): ChannelConfiguration {
        return index < ChannelConfiguration.Reserved ? index as ChannelConfiguration : ChannelConfiguration.Reserved;
    }

    /**
     * Get neural network type from raw value
     */
    static getNeuralNetworkType(value: number): NeuralNetworkType {
        return value < NeuralNetworkType.Reserved ? value as NeuralNetworkType : NeuralNetworkType.Reserved;
    }

    /**
     * Get coding profile from raw value
     */
    static getCodingProfile(value: number): CodingProfile {
        return value < CodingProfile.Reserved ? value as CodingProfile : CodingProfile.Reserved;
    }

    /**
     * Validate audio codec ID
     */
    static isValidAudioCodecId(codecId: number): boolean {
        return codecId === AudioCodecId.LOSSLESS || codecId === AudioCodecId.GENERAL;
    }

    /**
     * Get channel count from configuration
     */
    static getChannelCount(config: ChannelConfiguration): number {
        return CHANNEL_COUNTS[config] || 0;
    }

    /**
     * Get audio codec ID name in Chinese
     */
    static getAudioCodecIdName(codecId: AudioCodecId): string {
        switch (codecId) {
            case AudioCodecId.LOSSLESS: return '无损';
            case AudioCodecId.GENERAL: return '通用';
            default: return '未知';
        }
    }

    /**
     * Get neural network type name in Chinese
     */
    static getNeuralNetworkTypeName(type: NeuralNetworkType): string {
        switch (type) {
            case NeuralNetworkType.BASIC: return '神经网络基本配置';
            case NeuralNetworkType.LOW_COMPLEXITY: return '神经网络低复杂度配置';
            case NeuralNetworkType.Reserved:
            default: return '保留';
        }
    }

    /**
     * Get coding profile name in Chinese
     */
    static getCodingProfileName(profile: CodingProfile): string {
        switch (profile) {
            case CodingProfile.BASIC: return '基本框架';
            case CodingProfile.OBJECT_METADATA: return '对象元数据编码框架';
            case CodingProfile.FOA_HOA: return 'FOA/HOA数据编码框架';
            case CodingProfile.Reserved:
            default: return '保留';
        }
    }

    /**
     * Get channel configuration name in English
     */
    static getChannelConfigurationNameEN(config: ChannelConfiguration): string {
        switch (config) {
            case ChannelConfiguration.MONO: return 'Mono';
            case ChannelConfiguration.STEREO: return 'Stereo';
            case ChannelConfiguration.MC_5_1: return '5.1';
            case ChannelConfiguration.MC_7_1: return '7.1';
            case ChannelConfiguration.FOA: return 'FOA';
            case ChannelConfiguration.MC_5_1_2: return '5.1.2';
            case ChannelConfiguration.MC_5_1_4: return '5.1.4';
            case ChannelConfiguration.MC_7_1_2: return '7.1.2';
            case ChannelConfiguration.MC_7_1_4: return '7.1.4';
            case ChannelConfiguration.HOA_ORDER2: return '2nd Order HOA';
            case ChannelConfiguration.HOA_ORDER3: return '3rd Order HOA';
            case ChannelConfiguration.Reserved:
            default: return 'Reserved';
        }
    }

    /**
     * Get channel configuration name in Chinese
     */
    static getChannelConfigurationNameZH(config: ChannelConfiguration): string {
        switch (config) {
            case ChannelConfiguration.MONO: return '单声道';
            case ChannelConfiguration.STEREO: return '双声道立体声';
            case ChannelConfiguration.MC_5_1: return '5.1';
            case ChannelConfiguration.MC_7_1: return '7.1';
            case ChannelConfiguration.FOA: return 'FOA';
            case ChannelConfiguration.MC_5_1_2: return '5.1.2';
            case ChannelConfiguration.MC_5_1_4: return '5.1.4';
            case ChannelConfiguration.MC_7_1_2: return '7.1.2';
            case ChannelConfiguration.MC_7_1_4: return '7.1.4';
            case ChannelConfiguration.HOA_ORDER2: return '二阶HOA';
            case ChannelConfiguration.HOA_ORDER3: return '三阶HOA';
            case ChannelConfiguration.Reserved:
            default: return '保留';
        }
    }
}