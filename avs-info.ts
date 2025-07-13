// AVS视频信息相关接口和转换函数
import {
    getChromaFormatName,
    ChromaFormat,
    ColorPrimaries,
    TransferCharacteristics,
    MatrixCoefficients,
    ColorDescription,
    HDRDynamicMetadataType,
    PackingMode,
    getVideoFormatName,
    getColorPrimariesName,
    getTransferCharacteristicsName,
    getMatrixCoefficientsName,
    getColorDescriptionName,
    getHDRDynamicMetadataTypeName,
    getPackingModeNameZH
} from './avs-video-common.js';

import {
    NeuralNetworkType,
    CodingProfile,
    ChannelConfiguration,
    AudioCodecId,
    AV3AUtils
} from './av3a-common.js';

// AVS视频描述符接口 (按AVS1、AVS2、AVS3实际字段顺序组织)
export interface AVSVideoDescriptor {
    // 基本信息 (所有AVS标准共有)
    generation_name: string;
    profile_name: string;
    level_name: string;
    multiple_frame_rate_flag: boolean;
    frame_rate: number;
    chroma_format: ChromaFormat;
    luma_bit_depth: number;
    chroma_bit_depth: number;

    // AVS1/AVS2特有字段
    AVS_still_present?: boolean;

    // AVS3特有字段
    temporal_id_flag?: boolean;
    td_mode_flag?: boolean;
    library_stream_flag?: boolean;
    library_picture_enable_flag?: boolean;
    colour_description?: ColorDescription | null;
    colour_primaries?: ColorPrimaries | null;
    transfer_characteristics?: TransferCharacteristics | null;
    matrix_coefficients?: MatrixCoefficients | null;
}

export interface AVSAudioDescriptor {
    audio_codec_id: AudioCodecId;
    sampling_frequency: number;
    nn_type?: NeuralNetworkType;
    coding_profile?: CodingProfile;
    channel_number?: number;
    channel_configuration?: ChannelConfiguration;
    object_channel_number?: number;
    order?: number;
    resolution: number;
    bit_rate?: number;
}


export interface AVSVideoInfo {
    // 基本信息
    generation_name: string;      // AVS代数 (如 "AVS", "AVS+")
    profile_name: string;
    level_name: string;

    // 视频属性
    horizontal_size: number;
    vertical_size: number;
    progressive: boolean;
    chroma_format: ChromaFormat;
    luma_bit_depth: number;
    chroma_bit_depth: number;
    frame_rate: number;
    low_delay: boolean;
    bit_rate: number;

    // 宽高比信息
    sample_aspect_ratio: string | null;  // SAR - 样本宽高比
    display_aspect_ratio: string | null; // DAR - 显示宽高比

    // 序列显示扩展（可选）
    video_format?: string;
    sample_range?: number;
    
    // HDR动态元数据扩展（AVS3专用）
    hdr_dynamic_metadata_type?: HDRDynamicMetadataType;
    
    colour_description?: ColorDescription | null;
    colour_primaries?: ColorPrimaries | null;
    transfer_characteristics?: TransferCharacteristics | null;
    matrix_coefficients?: MatrixCoefficients | null;
    display_horizontal_size?: number;
    display_vertical_size?: number;
    packing_mode?: PackingMode;
}

export interface AVSAudioInfo {
    audio_codec_id: number;
    nn_type?: NeuralNetworkType;
    coding_profile: CodingProfile;
    sampling_frequency: number;
    channel_number?: number;
    channel_configuration?: ChannelConfiguration;
    object_channel_number?: number;
    order?: number;
    resolution: number;
    bit_rate?: number;
}

// 格式化比特率
export function formatBitRate(bps: number): string {
    if (bps === 0) return '0 bps';
    
    const k = 1000; // 比特率通常使用1000作为进制
    const sizes = ['bps', 'Kbps', 'Mbps', 'Gbps'];
    let i = 0;
    while (bps >= k) {
        bps /= k;
        i++;
    }
    
    // 保留4位有效数字
    const value = bps;
    let decimalPlaces = 3;
    if (value >= 1000) decimalPlaces = 1;
    else if (value >= 100) decimalPlaces = 2;
    else if (value >= 10) decimalPlaces = 3;
    else decimalPlaces = 3;
    
    return parseFloat(value.toFixed(decimalPlaces)) + ' ' + sizes[i];
}

// 格式化采样频率
export function formatSamplingFrequency(hz: number): string {
    if (hz === 0) return '0 Hz';
    
    if (hz >= 1000) {
        return `${(hz / 1000).toFixed(1)} kHz`;
    }
    return `${hz} Hz`;
}


// Helper: Convert AVSVideoInfo to display items
export function AVSVideoInfoToDisplayItems(details: AVSVideoInfo): { label: string; value: string; isHighlight?: boolean }[] {
    const items: { label: string; value: string; isHighlight?: boolean }[] = [];
    items.push(
        { label: 'AVS代数', value: details.generation_name, isHighlight: true },
        { label: '档次', value: details.profile_name },
        { label: '级别', value: details.level_name },
        { label: '分辨率', value: `${details.horizontal_size}x${details.vertical_size}` }
    );
    if (details.display_horizontal_size !== undefined && details.display_vertical_size !== undefined) {
        items.push({ label: '显示分辨率', value: `${details.display_horizontal_size}x${details.display_vertical_size}` });
    }
    items.push(
        { label: '扫描方式', value: details.progressive ? '逐行' : '隔行' },
        { label: '色度格式', value: getChromaFormatName(details.chroma_format) },
        { label: '位深度', value: `${details.luma_bit_depth} bits` },
        { label: '帧率', value: `${details.frame_rate} fps` },
        { label: '码率', value: formatBitRate(details.bit_rate) },
        { label: '低延时', value: details.low_delay ? '是' : '否' }
    );
    if (details.sample_aspect_ratio) items.push({ label: '样本宽高比', value: details.sample_aspect_ratio });
    if (details.display_aspect_ratio) items.push({ label: '显示宽高比', value: details.display_aspect_ratio });
    if (details.video_format) items.push({ label: '视频格式', value: details.video_format });
    if (details.hdr_dynamic_metadata_type != null) items.push({ label: 'HDR动态元数据类型', value: getHDRDynamicMetadataTypeName(details.hdr_dynamic_metadata_type) });
    if (details.colour_description != null) items.push({ label: '颜色描述', value: getColorDescriptionName(details.colour_description) });
    if (details.colour_primaries != null) items.push({ label: '彩色三基色', value: getColorPrimariesName(details.colour_primaries) });
    if (details.transfer_characteristics != null) items.push({ label: '转移特性', value: getTransferCharacteristicsName(details.transfer_characteristics) });
    if (details.matrix_coefficients != null) items.push({ label: '矩阵系数', value: getMatrixCoefficientsName(details.matrix_coefficients) });
    if (details.packing_mode != null && details.packing_mode !== PackingMode.MONO) {
        items.push({ label: '3D类型', value: getPackingModeNameZH(details.packing_mode) });
    }
    return items;
}

export function AVSAudioInfoToDisplayItems(details: AVSAudioInfo): { label: string; value: string; isHighlight?: boolean }[] {
    const items: { label: string; value: string; isHighlight?: boolean }[] = [];
    items.push({ label: '格式', value: 'Audio Vivid', isHighlight: true });
    items.push({ label: '编码框架', value: AV3AUtils.getCodingProfileName(details.coding_profile) });
    items.push({ label: '编码数据', value: AV3AUtils.getAudioCodecIdName(details.audio_codec_id) });
    if (details.bit_rate != null) {
        items.push({ label: '码率', value: formatBitRate(details.bit_rate) });
    }
    if (details.nn_type != null) {
        items.push({ label: '神经网络配置', value: AV3AUtils.getNeuralNetworkTypeName(details.nn_type) });
    }
    if (details.channel_number != null) {
        items.push({ label: '声道数', value: details.channel_number.toString() });
    }
    if (details.channel_configuration != null) {
        items.push({ label: '声道布局', value: AV3AUtils.getChannelConfigurationNameZH(details.channel_configuration) });
    }
    if (details.object_channel_number != null) {
        items.push({ label: '对象声道数', value: details.object_channel_number.toString() });
    }
    if (details.order != null) {
        items.push({ label: '阶数', value: details.order.toString() });
    }
    items.push({ label: '采样率', value: formatSamplingFrequency(details.sampling_frequency) });
    items.push({ label: '位深度', value: `${details.resolution} bits` });
    return items;
}

// Helper: Convert AVSVideoDescriptor to display items
export function AVSVideoDescriptorToDisplayItems(descriptor: AVSVideoDescriptor): { label: string; value: string; isHighlight?: boolean }[] {
    const items: { label: string; value: string; isHighlight?: boolean }[] = [];
    items.push(
        { label: 'AVS代数', value: descriptor.generation_name, isHighlight: true },
        { label: '档次', value: descriptor.profile_name },
        { label: '级别', value: descriptor.level_name }
    );
    
    const secondBatch: { label: string; value: string }[] = [];
    secondBatch.push({ label: '色度格式', value: getChromaFormatName(descriptor.chroma_format) });
    secondBatch.push({ label: '位深度', value: `${descriptor.luma_bit_depth} bits` });
    secondBatch.push({ label: '帧率', value: `${descriptor.frame_rate} fps` });
    items.push(...secondBatch);
    
    if (descriptor.colour_description != null) items.push({ label: '颜色描述', value: getColorDescriptionName(descriptor.colour_description) });
    if (descriptor.colour_primaries != null) items.push({ label: '彩色三基色', value: getColorPrimariesName(descriptor.colour_primaries) });
    if (descriptor.transfer_characteristics != null) items.push({ label: '转移特性', value: getTransferCharacteristicsName(descriptor.transfer_characteristics) });
    if (descriptor.matrix_coefficients != null) items.push({ label: '矩阵系数', value: getMatrixCoefficientsName(descriptor.matrix_coefficients) });
    return items;
} 

export function AVSAudioDescriptorToDisplayItems(descriptor: AVSAudioDescriptor): { label: string; value: string; isHighlight?: boolean }[]  {
    const items: { label: string; value: string; isHighlight?: boolean }[] = [];
    items.push({ label: '格式', value: 'Audio Vivid', isHighlight: true });
    if (descriptor.coding_profile != null) {
        items.push({ label: '编码框架', value: AV3AUtils.getCodingProfileName(descriptor.coding_profile) });
    }
    items.push({ label: '编码数据', value: AV3AUtils.getAudioCodecIdName(descriptor.audio_codec_id) });
    if (descriptor.bit_rate != null) {
        items.push({ label: '码率', value: formatBitRate(descriptor.bit_rate) });
    }
    if (descriptor.nn_type != null) {
        items.push({ label: '神经网络配置', value: AV3AUtils.getNeuralNetworkTypeName(descriptor.nn_type) });
    }
    if (descriptor.channel_number != null) {
        items.push({ label: '声道数', value: descriptor.channel_number.toString() });
    }
    if (descriptor.channel_configuration != null) {
        items.push({ label: '声道布局', value: AV3AUtils.getChannelConfigurationNameZH(descriptor.channel_configuration) });
    }
    if (descriptor.object_channel_number != null) {
        items.push({ label: '对象声道数', value: descriptor.object_channel_number.toString() });
    }
    if (descriptor.order != null) {
        items.push({ label: '阶数', value: descriptor.order.toString() });
    }
    items.push({ label: '采样率', value: formatSamplingFrequency(descriptor.sampling_frequency) });
    items.push({ label: '位深度', value: `${descriptor.resolution} bits` });
    return items;
}

// Helper: Convert AVSVideoInfo to copy-friendly format
export function AVSVideoInfoToCopyFormat(details: AVSVideoInfo, pid: number): string {
    const items: { label: string; value: string }[] = [];
        
    // ID in the original source medium: 十进制(16进制)
    items.push({ label: 'ID in the original source medium', value: `${pid} (0x${pid.toString(16).toUpperCase().padStart(4, '0')})` });

    // 收集所有label-value对
    items.push({ label: 'Format', value: details.generation_name });

    // Format standard: AVS,AVS+,AVS2,AVS3分别对应AVS1-P2,AVS1-P16,AVS2-P2,AVS3-P2
    let formatStandard = '';
    switch (details.generation_name) {
        case 'AVS':
            formatStandard = 'AVS1-P2';
            break;
        case 'AVS+':
            formatStandard = 'AVS1-P16';
            break;
        case 'AVS2':
            formatStandard = 'AVS2-P2';
            break;
        case 'AVS3':
            formatStandard = 'AVS3-P2';
            break;
        default:
            formatStandard = 'Unknown';
    }
    items.push({ label: 'Format standard', value: formatStandard });
    
    // Format profile: 提取括号内的内容并省略Profile
    const profileMatch = details.profile_name.match(/\(([^)]+)\)/);
    let profileName = profileMatch ? profileMatch[1] : details.profile_name;
    // 去掉Profile后缀
    profileName = profileName.replace(/\s*Profile$/, '');
    items.push({ label: 'Format profile', value: `${profileName}@L${details.level_name}` });
    
    // HDR dynamic metatype
    if (details.hdr_dynamic_metadata_type != null) {
        items.push({ label: 'HDR dynamic metatype', value: getHDRDynamicMetadataTypeName(details.hdr_dynamic_metadata_type) });
    }
    
    // Bit rate: 同display
    items.push({ label: 'Bit rate', value: formatBitRate(details.bit_rate) });
    
    // Width: 格式是 1 920 pixels
    items.push({ label: 'Width', value: `${details.horizontal_size.toLocaleString()} pixels` });
    
    // Height: 格式是 1 920 pixels
    items.push({ label: 'Height', value: `${details.vertical_size.toLocaleString()} pixels` });
    
    // Sample aspect ratio
    if (details.sample_aspect_ratio) {
        items.push({ label: 'Sample aspect ratio', value: details.sample_aspect_ratio });
    }
    
    // Display aspect ratio: 同display
    if (details.display_aspect_ratio) {
        items.push({ label: 'Display aspect ratio', value: details.display_aspect_ratio });
    }
    
    // Frame rate: XXXX FPS
    items.push({ label: 'Frame rate', value: `${details.frame_rate} FPS` });
    
    // Chroma format: 同display
    items.push({ label: 'Chroma format', value: getChromaFormatName(details.chroma_format) });
    
    // Scan type: 用英文
    items.push({ label: 'Scan type', value: details.progressive ? 'Progressive' : 'Interlaced' });
    
    // Bit depth: 8 bits这样子
    items.push({ label: 'Bit depth', value: `${details.luma_bit_depth} bits` });
    
    // Colour primaries, Transfer characteristics, Matrix coefficients
    // 当colour_description存在时，显示组合的颜色描述
    if (details.colour_description != null) {
        items.push({ label: 'Colour primaries / Transfer characteristics / Matrix coefficients', value: getColorDescriptionName(details.colour_description) });
    } else {
        // 如果没有colour_description，分别显示各个字段
        if (details.colour_primaries != null) {
            items.push({ label: 'Colour primaries', value: getColorPrimariesName(details.colour_primaries) });
        }
        
        if (details.transfer_characteristics != null) {
            items.push({ label: 'Transfer characteristics', value: getTransferCharacteristicsName(details.transfer_characteristics) });
        }
        
        if (details.matrix_coefficients != null) {
            items.push({ label: 'Matrix coefficients', value: getMatrixCoefficientsName(details.matrix_coefficients) });
        }
    }
    
    // 计算最长label长度用于对齐
    const maxLabelLength = Math.max(...items.map(item => item.label.length));
    
    // 格式化为最终字符串
    const lines = items.map(item => `${item.label.padEnd(maxLabelLength)}: ${item.value}`);
    
    return lines.join('\n');
} 

export function AVSAudioInfoToCopyFormat(details: AVSAudioInfo, pid: number): string {
    const items: { label: string; value: string }[] = [];
    
    items.push({ label: 'ID in the original source medium', value: `${pid} (0x${pid.toString(16).toUpperCase().padStart(4, '0')})` });
    items.push({ label: 'Format', value: 'av3a' });
    items.push({ label: 'Format Standard', value: 'AVS3-P3' });
    items.push({ label: 'Commercial name', value: 'Audio Vivid' });
    
    if (details.bit_rate != null) {
        items.push({ label: 'Bit rate', value: formatBitRate(details.bit_rate) });
    }
    
    if (details.channel_number != null) {
        const channelText = details.channel_number === 1 ? 'Channel' : 'Channels';
        items.push({ label: 'Channel(s)', value: `${details.channel_number} ${channelText}` });
    }
    
    if (details.channel_configuration != null) {
        items.push({ label: 'Channel layout', value: AV3AUtils.getChannelConfigurationNameEN(details.channel_configuration) });
    }
    
    items.push({ label: 'Sampling frequency', value: formatSamplingFrequency(details.sampling_frequency) });
    items.push({ label: 'Bit depth', value: `${details.resolution} bits` });
    
    const maxLabelLength = Math.max(...items.map(item => item.label.length));
    const lines = items.map(item => `${item.label.padEnd(maxLabelLength)}: ${item.value}`);
    
    return lines.join('\n');
}