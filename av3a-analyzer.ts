/**
 * AV3A Analyzer - Specialized for AVS3 Audio codec
 */

import { BitReader } from './utils.js';
import {
    AudioCodecId,
    NeuralNetworkType,
    CodingProfile,
    ChannelConfiguration,
    AV3AUtils
} from './av3a-common.js';

/**
 * Bitrate tables for different channel configurations (values in kbps)
 */
const BITRATE_TABLES: Record<ChannelConfiguration, number[]> = {
    [ChannelConfiguration.MONO]: [0, 32, 44, 56, 64, 72, 80, 96, 128, 144, 164, 192],
    [ChannelConfiguration.STEREO]: [0, 32, 48, 64, 80, 96, 128, 144, 192, 256, 320],
    [ChannelConfiguration.MC_5_1]: [192, 256, 320, 384, 448, 512, 640, 720, 144, 96, 128, 160],
    [ChannelConfiguration.MC_7_1]: [192, 480, 256, 384, 576, 640, 128, 160],
    [ChannelConfiguration.FOA]: [0, 96, 128, 192, 256],
    [ChannelConfiguration.MC_5_1_2]: [152, 320, 480, 576],
    [ChannelConfiguration.MC_5_1_4]: [176, 384, 576, 704, 256, 448],
    [ChannelConfiguration.MC_7_1_2]: [216, 480, 576, 384, 768],
    [ChannelConfiguration.MC_7_1_4]: [240, 608, 384, 512, 832],
    [ChannelConfiguration.HOA_ORDER2]: [192, 256, 320, 384, 480, 512, 640],
    [ChannelConfiguration.HOA_ORDER3]: [256, 320, 384, 512, 640, 896],
    [ChannelConfiguration.Reserved]: []
};

function queryBitrate(channel_configuration: ChannelConfiguration, bitrate_index: number): number {
    return BITRATE_TABLES[channel_configuration][bitrate_index] || 0;
}

/**
 * Parsed AV3A frame header information
 */
type AV3AFrameHeader = {
    audio_codec_id: number;
    nn_type?: NeuralNetworkType;
    coding_profile: CodingProfile;
    sampling_frequency: number;
    raw_frame_length?: number;
    channel_number?: number;
    channel_configuration?: ChannelConfiguration;
    object_channel_number?: number;
    order?: number;
    resolution: number;
    bit_rate?: number;
}

/**
 * Main AV3A Analyzer class
 */
export class AV3AAnalyzer {
    /**
     * Analyze AV3A frame header
     */
    public analyze(data: Uint8Array): AV3AFrameHeader | null {
        let offset = 0;
        
        // Search for syncword (0xFFF) in the data stream
        while (offset <= data.length - 2) {
            // Check for 0xFFF (12 bits): first byte must be 0xFF, second byte must have top 4 bits as 0xF
            if (data[offset] === 0xFF && (data[offset + 1] & 0xF0) === 0xF0) {
                try {
                    const reader = new BitReader(data, offset);
                    
                    // Skip the syncword (12 bits)
                    reader.readBits(12);
                    
                    // Parse audio_codec_id (4 bits)
                    const audio_codec_id = reader.readBits(4);
                    if (!AV3AUtils.isValidAudioCodecId(audio_codec_id)) {
                        offset++;
                        continue;
                    }
                    
                    // Parse anc_data_index (1 bit) - read but not used
                    reader.readBits(1);
                    
                    return this.parseAATFFrameHeader(reader, audio_codec_id);
                } catch (error) {
                    console.warn(`Failed to parse AV3A frame header at offset ${offset}:`, (error as Error).message);
                    offset++;
                    continue;
                }
            }
            offset++;
        }
        
        console.warn('Syncword 0xFFF not found in data');
        return null;
    }

    /**
     * Parse AV3A frame header according to the provided pseudocode
     * 
     * aatf_frame_header() 
     * { 
     *     if(audio_codec_id==2) { 
     *         nn_type 3 uimsbf 
     *     } 
     *     coding_profile 3 uimsbf 
     *     sampling_frequency_index 4 uimsbf 
     *     if(audio_codec_id==1) { 
     *         if (sampling_frequency_index==0xf) { 
     *             sampling_frequency 24 uimsbf 
     *         } 
     *     } 
     *     if(audio_codec_id != 2){ 
     *         raw_frame_length 16 bslbf 
     *     } 
     *     aatf_error_check() 
     *     if(audio_codec_id==1) 
     *         channel_number {4; 8} bslbf 
     *     if(audio_codec_id==2){ 
     *         if(coding_profile ==0){ 
     *             channel_number_index 7 bslbf 
     *         } 
     *         if(coding_profile ==1){ 
     *             soundBedType 2 uimsbf 
     *             if (soundBedType == 0){ 
     *                 object_channel_number 7 uimsbf 
     *                 bitrate_index_per_channel 4 uimsbf 
     *             } else if (soundBedType == 1){ 
     *                 channel_number_index 7 bslbf 
     *                 bitrate_index 4 uimsbf 
     *                 object_channel_number 7 uimsbf 
     *                 bitrate_index_per_channel 4 uimsbf 
     *             } 
     *         } 
     *         if(coding_profile ==2){ 
     *             order 4 uimsbf 
     *         } 
     *     } 
     *     resolution 2 uimsbf 
     *     if(audio_codec_id==2 && coding_profile != 1){ 
     *         bitrate_index  4 uimsbf 
     *     } 
     * }
     */
    private parseAATFFrameHeader(reader: BitReader, audio_codec_id: number): AV3AFrameHeader {
        try {
            let nn_type: NeuralNetworkType | undefined;
            
            if (audio_codec_id == 2) {
                const nn_type_raw = reader.readBits(3);
                nn_type = AV3AUtils.getNeuralNetworkType(nn_type_raw);
            }
            
            const coding_profile_raw = reader.readBits(3);
            const coding_profile = AV3AUtils.getCodingProfile(coding_profile_raw);
            
            const sampling_frequency_index = reader.readBits(4);
            
            const sampling_frequency = (audio_codec_id == 1 && sampling_frequency_index == 0xf) ? reader.readBits(24) : AV3AUtils.getSamplingFrequency(sampling_frequency_index);
            
            let raw_frame_length: number | undefined;
            if (audio_codec_id != 2) {
                raw_frame_length = reader.readBits(16);
            }
            
            // aatf_error_check() - 8bit CRC check, skip
            reader.skipBits(8);
            
            let channel_number: number | undefined;
            let channel_configuration: ChannelConfiguration | undefined;
            let object_channel_number: number | undefined;
            let order: number | undefined;
            let bit_rate: number | undefined;
            
            if (audio_codec_id == 1) {
                const channel_bits = reader.readBits(4);
                if (channel_bits == 15) {
                    channel_number = reader.readBits(8);
                } else {
                    channel_number = channel_bits;
                }
            }
            
            if (audio_codec_id == 2) {
                if (coding_profile == CodingProfile.BASIC) {
                    const channel_number_index = reader.readBits(7);
                    channel_configuration = AV3AUtils.getChannelConfiguration(channel_number_index);
                    channel_number = AV3AUtils.getChannelCount(channel_configuration);
                }
                
                if (coding_profile == CodingProfile.OBJECT_METADATA) {
                    const soundBedType = reader.readBits(2);
                    
                    if (soundBedType == 0) {
                        const objects = reader.readBits(7) + 1;
                        object_channel_number = objects;
                        const obj_bitrate_index = reader.readBits(4);
                        bit_rate = queryBitrate(ChannelConfiguration.MONO, obj_bitrate_index) * objects;
                    } else if (soundBedType == 1) {
                        const channel_number_index = reader.readBits(7);
                        channel_configuration = AV3AUtils.getChannelConfiguration(channel_number_index);
                        const bed_bitrate_index = reader.readBits(4);
                        const objects = reader.readBits(7) + 1;
                        object_channel_number = objects;
                        const obj_bitrate_index = reader.readBits(4);
                        
                        const bed_bitrate = queryBitrate(channel_configuration, bed_bitrate_index);
                        const obj_bitrate = queryBitrate(ChannelConfiguration.MONO, obj_bitrate_index) * objects;
                        bit_rate = bed_bitrate + obj_bitrate;
                        channel_number = AV3AUtils.getChannelCount(channel_configuration);
                    }
                }
                
                if (coding_profile == CodingProfile.FOA_HOA) {
                    order = reader.readBits(4);
                }
            }
            
            const resolution_raw = reader.readBits(2);
            const resolution = AV3AUtils.getResolution(resolution_raw);
            
            if (audio_codec_id == 2 && coding_profile != CodingProfile.OBJECT_METADATA) {
                const bitrate_index = reader.readBits(4);
                bit_rate = queryBitrate(channel_configuration, bitrate_index);
            }

            bit_rate *= 1000;
            
            return {
                audio_codec_id,
                nn_type,
                coding_profile,
                sampling_frequency,
                raw_frame_length,
                channel_number,
                channel_configuration,
                object_channel_number,
                order,
                resolution,
                bit_rate,
            };
            
        } catch (error) {
            throw new Error(`Failed to parse AV3A frame header: ${(error as Error).message}`);
        }
    }

}

// Re-export from common
export {
    AudioCodecId,
    NeuralNetworkType,
    CodingProfile,
    ChannelConfiguration
} from './av3a-common.js';

// Re-export utility functions
export const getAudioCodecIdName = AV3AUtils.getAudioCodecIdName;
export const getNeuralNetworkTypeName = AV3AUtils.getNeuralNetworkTypeName;
export const getCodingProfileName = AV3AUtils.getCodingProfileName;
export const getChannelConfigurationNameEN = AV3AUtils.getChannelConfigurationNameEN;
export const getChannelConfigurationNameZH = AV3AUtils.getChannelConfigurationNameZH;