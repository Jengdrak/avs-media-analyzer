import { BitReader } from './utils.js';
import { AVS1Utils } from './avs1-common.js';
import { AVS2Utils } from './avs2-common.js';
import { AVS3Utils } from './avs3-common.js';
import { ChromaFormat, ColorPrimaries, TransferCharacteristics, MatrixCoefficients, ColorDescription, getCombinedColorDescription } from './avs-video-common.js';
import { AudioCodecId, NeuralNetworkType, CodingProfile, ChannelConfiguration, AV3AUtils } from './av3a-common.js';

/**
 * AVS1视频描述符的解析后结构
 */
type ParsedAVS1VideoDescriptor = {
    generation_name: string;
    profile_name: string;
    level_name: string;
    multiple_frame_rate_flag: boolean;
    frame_rate: number;
    AVS_still_present: boolean;
    chroma_format: ChromaFormat;
    luma_bit_depth: number;
    chroma_bit_depth: number;
};

/**
 * AVS2视频描述符的解析后结构
 */
type ParsedAVS2VideoDescriptor = {
    generation_name: string;
    profile_name: string;
    level_name: string;
    multiple_frame_rate_flag: boolean;
    frame_rate: number;
    AVS_still_present: boolean;
    chroma_format: ChromaFormat;
    luma_bit_depth: number;
    chroma_bit_depth: number;
};

/**
 * AVS3视频描述符的解析后结构
 */
type ParsedAVS3VideoDescriptor = {
    generation_name: string;
    profile_name: string;
    level_name: string;
    multiple_frame_rate_flag: boolean;
    frame_rate: number;
    chroma_format: ChromaFormat;
    luma_bit_depth: number;
    chroma_bit_depth: number;
    temporal_id_flag: boolean;
    td_mode_flag: boolean;
    library_stream_flag: boolean;
    library_picture_enable_flag: boolean;
    colour_description: ColorDescription | null;
    colour_primaries: ColorPrimaries | null;
    transfer_characteristics: TransferCharacteristics | null;
    matrix_coefficients: MatrixCoefficients | null;
};

/**
 * AVS3音频描述符的解析后结构
 */
type ParsedAVS3AudioDescriptor = {
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
};

/**
 * 解析AVS1视频描述符
 * @param payload descriptor的负载 (不包括tag和length)
 * @returns 解析后的AVS1视频描述符对象，如果负载长度不足则返回null
 */
export function parseAVS1VideoDescriptor(payload: Uint8Array): ParsedAVS1VideoDescriptor | null {
    /**
     * AVS_video_descriptor (){
     *  位数    助 记符
     *  descriptor_tag             8      uimsbf
     *  descriptor_length          8      uimsbf
     *  profile_id                 8      uimsbf
     *  level_id                   8      uimsbf
     *  multiple_frame_rate_flag   1      bslbf
     *  frame_rate_code            4      uimsbf
     *  AVS_still_present          1      bslbf
     *  chroma_format              2      uimsbf
     *  sample_precision           3      uimsbf
     *  reserved                   5      bslbf
     * }
     */
    
    if (payload.length < 4) {
        return null;
    }

    const reader = new BitReader(payload);

    const profile_id = reader.readBits(8);
    const level_id = reader.readBits(8);
    
    const multiple_frame_rate_flag = reader.readBoolean();
    const frame_rate_code = reader.readBits(4);
    const AVS_still_present = reader.readBoolean();
    const chroma_format_value = reader.readBits(2);
    
    const sample_precision = reader.readBits(3);
    reader.skipBits(5); // reserved

    const bit_depth_info = AVS1Utils.getBitDepthFromSamplePrecision(sample_precision);

    return {
        generation_name: profile_id == 0x48 ? 'AVS+' : 'AVS',
        profile_name: AVS1Utils.getProfileName(profile_id),
        level_name: AVS1Utils.getLevelName(level_id),
        multiple_frame_rate_flag,
        frame_rate: AVS1Utils.getFrameRate(frame_rate_code),
        AVS_still_present,
        chroma_format: chroma_format_value as ChromaFormat,
        luma_bit_depth: bit_depth_info.luma_bit_depth,
        chroma_bit_depth: bit_depth_info.chroma_bit_depth,
    };
} 

/**
 * 解析AVS2视频描述符
 * @param payload descriptor的负载 (不包括tag和length)
 * @returns 解析后的AVS2视频描述符对象，如果负载长度不足则返回null
 */
export function parseAVS2VideoDescriptor(payload: Uint8Array): ParsedAVS2VideoDescriptor | null {
    /**
     * AVS2_video_descriptor (){
     *  位数    助 记符
     *  descriptor_tag             8      uimsbf
     *  descriptor_length          8      uimsbf
     *  profile_id                 8      uimsbf
     *  level_id                   8      uimsbf
     *  multiple_frame_rate_flag   1      bslbf
     *  frame_rate_code            4      uimsbf
     *  AVS_still_present          1      bslbf
     *  chroma_format              2      uimsbf
     *  sample_precision           3      uimsbf
     *  reserved                   5      bslbf
     * }
     */
    
    if (payload.length < 4) {
        return null;
    }

    const reader = new BitReader(payload);

    const profile_id = reader.readBits(8);
    const level_id = reader.readBits(8);
    
    const multiple_frame_rate_flag = reader.readBoolean();
    const frame_rate_code = reader.readBits(4);
    const AVS_still_present = reader.readBoolean();
    const chroma_format_value = reader.readBits(2);
    
    const sample_precision = reader.readBits(3);
    reader.skipBits(5); // reserved

    const bit_depth_info = AVS2Utils.getBitDepthFromPrecision(sample_precision);

    return {
        generation_name: 'AVS2',
        profile_name: AVS2Utils.getProfileName(profile_id),
        level_name: AVS2Utils.getLevelName(level_id),
        multiple_frame_rate_flag,
        frame_rate: AVS2Utils.getFrameRate(frame_rate_code),
        AVS_still_present,
        chroma_format: chroma_format_value as ChromaFormat,
        luma_bit_depth: bit_depth_info.luma_bit_depth,
        chroma_bit_depth: bit_depth_info.chroma_bit_depth,
    };
}

/**
 * 解析AVS3视频描述符
 * @param payload descriptor的负载 (不包括tag和length)
 * @returns 解析后的AVS3视频描述符对象，如果负载长度不足则返回null
 */
export function parseAVS3VideoDescriptor(payload: Uint8Array): ParsedAVS3VideoDescriptor | null {
    /**
     * AVS3_video_descriptor () {   
     *  位数    助记符
     *  descriptor_tag                     8      uimsbf
     *  descriptor_length                  8      uimsbf
     *  profile_id                         8      uimsbf
     *  level_id                           8      uimsbf
     *  multiple_frame_rate_flag           1      bslbf
     *  frame_rate_code                    4      uimsbf
     *  sample_precision                   3      uimsbf
     *  chroma_format                      2      uimsbf
     *  temporal_id_flag                   1      uimsbf
     *  td_mode_flag                       1      bslbf
     *  library_stream_flag                1      bslbf
     *  library_picture_enable_flag        1      uimsbf
     *  reserved                           2      bslbf
     *  colour_primaries                   8      uimsbf
     *  transfer_characteristics           8      uimsbf
     *  matrix_coefficients                8      uimsbf
     *  reserved                           8      bslbf
     * }
     */
    
    if (payload.length < 8) {
        return null;
    }

    const reader = new BitReader(payload);

    const profile_id = reader.readBits(8);
    const level_id = reader.readBits(8);
    
    const multiple_frame_rate_flag = reader.readBoolean();
    const frame_rate_code = reader.readBits(4);
    const sample_precision = reader.readBits(3);
    const chroma_format_value = reader.readBits(2);
    
    const temporal_id_flag = reader.readBoolean();
    const td_mode_flag = reader.readBoolean();
    const library_stream_flag = reader.readBoolean();
    const library_picture_enable_flag = reader.readBoolean();
    reader.skipBits(2); // reserved

    const colour_primaries = reader.readBits(8);
    const transfer_characteristics = reader.readBits(8);
    const matrix_coefficients = reader.readBits(8);
    reader.skipBits(8); // reserved

    const bit_depth_info = AVS3Utils.getBitDepthFromPrecision(sample_precision);

    // AVS3只支持YUV420，其他值视为保留
    const chroma_format = chroma_format_value === 1 ? ChromaFormat.YUV420 : ChromaFormat.RESERVED;

    const validated_primaries = AVS3Utils.getColorPrimaries(colour_primaries);
    const validated_transfer = AVS3Utils.getTransferCharacteristics(transfer_characteristics);
    const validated_matrix = AVS3Utils.getMatrixCoefficients(matrix_coefficients);

    return {
        generation_name: 'AVS3',
        profile_name: AVS3Utils.getProfileName(profile_id),
        level_name: AVS3Utils.getLevelName(level_id),
        multiple_frame_rate_flag,
        frame_rate: AVS3Utils.getFrameRate(frame_rate_code),
        chroma_format: chroma_format,
        luma_bit_depth: bit_depth_info.luma_bit_depth,
        chroma_bit_depth: bit_depth_info.chroma_bit_depth,
        temporal_id_flag,
        td_mode_flag,
        library_stream_flag,
        library_picture_enable_flag,
        colour_description: validated_primaries && validated_transfer && validated_matrix 
            ? getCombinedColorDescription(validated_primaries, validated_transfer, validated_matrix)
            : null,
        colour_primaries: validated_primaries,
        transfer_characteristics: validated_transfer,
        matrix_coefficients: validated_matrix,
    };
} 

/**
 * 解析AVS3音频描述符
 * @param payload descriptor的负载 (不包括tag和length)
 * @returns 解析后的AVS3音频描述符对象，如果负载长度不足则返回null
 */
export function parseAVS3AudioDescriptor(payload: Uint8Array): ParsedAVS3AudioDescriptor | null {
    /**
     * AVS3_audio_descriptor(){
     *     descriptor_tag 8  uimsbf 
     *     descriptor_length  8  uimsbf 
     *     audio_codec_id 4 uimsbf 
     *     sampling_frequency_index  4  uimsbf 
     *     if(audio_codec_id==1) {   
     *         if (sampling_frequency_index==0xf) {   
     *             sampling_frequency 24 uimsbf 
     *         }   
     *         anc_data_index 1 bslbf 
     *         coding_profile 3 bslbf 
     *         reserved 4 uimsbf 
     *         channel_number 8 uimsbf 
     *     } 
     *      if(audio_codec_id==2) {   
     *         nn_type 3 uimsbf 
     *         reserved 1 bslbf 
     *         content_type 4 uimsbf 
     *         if(content_type==0) {   
     *             channel_number_index 7 uimsbf 
     *             reserved 1 bslbf 
     *         }else if(content_type==1) {   
     *             object_channel_number 7 uimsbf 
     *             reserved 1 bslbf 
     *         }else if(content_type==2) {   
     *             channel_number_index 7 uimsbf 
     *             reserved 1 bslbf 
     *             object_channel_number 7 uimsbf 
     *             reserved 1 bslbf 
     *         }else if(content_type==3) {   
     *             hoa_order 4 uimsbf 
     *             reserved 4 bslbf 
     *         }   
     *         total_bitrate 16 uimsbf 
     *     }   
     *     resolution 2 uimsbf 
     *     reserved 6 bslbf 
     *     for (i=0; i<N; i++) {   
     *         addition_info[i]  8  bslbf 
     *     }  
     * }
     */
    
    if (payload.length < 2) {
        return null;
    }

    const reader = new BitReader(payload);

    const audio_codec_id_raw = reader.readBits(4);
    const audio_codec_id = AV3AUtils.isValidAudioCodecId(audio_codec_id_raw) ? audio_codec_id_raw as AudioCodecId : AudioCodecId.GENERAL;
    
    const sampling_frequency_index = reader.readBits(4);
    let sampling_frequency = AV3AUtils.getSamplingFrequency(sampling_frequency_index);

    let nn_type: NeuralNetworkType | undefined;
    let coding_profile: CodingProfile | undefined;
    let channel_number: number | undefined;
    let channel_configuration: ChannelConfiguration | undefined;
    let object_channel_number: number | undefined;
    let order: number | undefined;
    let bit_rate: number | undefined;

    if (audio_codec_id == AudioCodecId.LOSSLESS) {
        if (sampling_frequency_index == 0xf) {
            sampling_frequency = reader.readBits(24);
        }
        reader.skipBits(1); // anc_data_index
        const coding_profile_raw = reader.readBits(3);
        coding_profile = AV3AUtils.getCodingProfile(coding_profile_raw);
        reader.skipBits(4); // reserved
        channel_number = reader.readBits(8);
    }

    if (audio_codec_id == AudioCodecId.GENERAL) {
        const nn_type_raw = reader.readBits(3);
        nn_type = AV3AUtils.getNeuralNetworkType(nn_type_raw);
        reader.skipBits(1); // reserved
        
        const content_type = reader.readBits(4);
        
        if (content_type == 0) {
            const channel_number_index = reader.readBits(7);
            channel_configuration = AV3AUtils.getChannelConfiguration(channel_number_index);
            channel_number = AV3AUtils.getChannelCount(channel_configuration);
            reader.skipBits(1); // reserved
        } else if (content_type == 1) {
            object_channel_number = reader.readBits(7) + 1;
            reader.skipBits(1); // reserved
        } else if (content_type == 2) {
            const channel_number_index = reader.readBits(7);
            channel_configuration = AV3AUtils.getChannelConfiguration(channel_number_index);
            channel_number = AV3AUtils.getChannelCount(channel_configuration);
            reader.skipBits(1); // reserved
            object_channel_number = reader.readBits(7) + 1;
            reader.skipBits(1); // reserved
        } else if (content_type == 3) {
            order = reader.readBits(4);
            reader.skipBits(4); // reserved
        }
        
        const total_bitrate = reader.readBits(16);
        bit_rate = total_bitrate * 1000; // Convert to bps
    }

    const resolution_raw = reader.readBits(2);
    const resolution = AV3AUtils.getResolution(resolution_raw);
    reader.skipBits(6); // reserved

    // Skip additional info (rest of payload)
    // for (i=0; i<N; i++) addition_info[i] 8 bslbf

    return {
        audio_codec_id,
        sampling_frequency,
        nn_type,
        coding_profile,
        channel_number,
        channel_configuration,
        object_channel_number,
        order,
        resolution,
        bit_rate,
    };
}