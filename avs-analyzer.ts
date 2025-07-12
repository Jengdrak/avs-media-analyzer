/**
 * AVS1 Analyzer - Specialized for AVS1 (Audio Video Standard 1) codec
 * Focus on AVS1 standard only
 */

import { BitReader } from './utils.js';
import { 
    ChromaFormat, 
    getAspectRatioInfo, 
    getVideoFormatName,
    ColorPrimaries,
    TransferCharacteristics,
    MatrixCoefficients,
    ColorDescription,
    getCombinedColorDescription,
    PackingMode
} from './avs-video-common.js';
import { AVS1Utils, AVS1Profile } from './avs1-common.js';


/**
 * Stereo packing mode according to AVS1 standard
 */
enum StereoPackingMode {
    MODE_2D = 0,            // 2D
    SBS = 1,                // Side by Side
    OU = 2,                 // Over Under
    RESERVED = 3            // 保留
}

/**
 * Sequence Display Extension information
 */
type SequenceDisplayExtension = {
    video_format: string;
    sample_range: number;
    colour_description?: ColorDescription | null;
    colour_primaries?: ColorPrimaries | null;
    transfer_characteristics?: TransferCharacteristics | null;
    matrix_coefficients?: MatrixCoefficients | null;
    display_horizontal_size: number;
    display_vertical_size: number;
    packing_mode: PackingMode;
}

/**
 * Parsed AVS1 sequence header information
 */
type AVS1SequenceHeader = {
    // Basic info
    generation_name: string;     // AVS代数 (如 "AVS", "AVS+")
    profile_name: string;
    level_name: string;
    
    // Video properties
    horizontal_size: number;
    vertical_size: number;
    chroma_format: ChromaFormat;
    luma_bit_depth: number;
    chroma_bit_depth: number;
    
    // Frame properties
    progressive: boolean;
    frame_rate: number;
    sample_aspect_ratio: string | null;  // SAR - 样本宽高比
    display_aspect_ratio: string | null; // DAR - 显示宽高比
    
    // Buffer and rate info
    bit_rate: number; // Final bit rate in bps
    bbv_buffer_size: number;
    low_delay: boolean;
    
    // Additional flags
    fixed_pic_rate: boolean;
    
    // Shenzhan Profile (0x24) specific fields
    background_picture_disable: boolean;
    core_picture_disable: boolean;
    core_picture_buffer_size: number;
    slice_set_disable: boolean;
    scene_model: number;
    
}

/**
 * Complete AVS1 sequence information - either header only or header with extension
 */
type AVS1SequenceInfo = AVS1SequenceHeader | (AVS1SequenceHeader & SequenceDisplayExtension);

    /**
     * Main AVS1 Analyzer class
     */
    class AVS1Analyzer {
        /**
         * Convert AVS1 stereo packing mode to unified PackingMode enum
         * 将AVS1立体封装模式转换为统一的PackingMode枚举
         * MODE_2D (0) → MONO, SBS (1) → SBS (0), OU (2) → OU (1)
         */
        private convertAVS1StereoPackingMode(mode: number): PackingMode {
            switch (mode) {
                case 0: return PackingMode.MONO;        // MODE_2D -> MONO
                case 1: return PackingMode.SBS;         // SBS -> SBS (0)
                case 2: return PackingMode.OU;          // OU -> OU (1)
                case 3: return PackingMode.RESERVED;    // RESERVED -> RESERVED
                default: return PackingMode.RESERVED;
            }
        }
    /**
     * Find AVS1 sequence header start code
     */
    private findSequenceHeader(data: Uint8Array): number {
        // AVS1 sequence header start code: 0x000001B0
        for (let i = 0; i <= data.length - 4; i++) {
            if (data[i] === 0x00 && data[i + 1] === 0x00 && 
                data[i + 2] === 0x01 && data[i + 3] === 0xB0) {
                return i + 4; // Return position after start code
            }
        }
        return -1;
    }

    /**
     * Parse sequence display extension from BitReader
     * 
     * AVS流程伪代码:
     * sequence_header()
     *   extension_and_user_data(0)
     *   do{
     *     if(next_bits(32)==i_picture_start_code)
     *       i_picture_header()
     *     Else
     *       pb_picture_header()
     *     extension_and_user_data(1)
     *     picture_data()
     *   }while((next_bits(32) pb_picture_start_code)||(next_bits(32) i_picture_start_code))
     * }while(next_bits(32)!=video_sequence_end_code&&next_bits(32)!=video_edit_code)
     * 
     * 序列显示扩展只会出现在extension_and_user_data(0)中，I和P/B图像头分别是B3和B6
     * 扩展序列是以00 00 01 B5开头的，extension_id 是0b0010
     */
    private parseSequenceDisplayExtension(reader: BitReader): SequenceDisplayExtension | null {
        try {
            // Parse sequence_display_extension according to syntax:
            // sequence_display_extension(){
            //   extension_start_code f(32)
            //   extension_id f(4)               
            //   video_format u(3)
            //   sample_range u(1)
            //   colour_description u(1)
            //   if(colour_description){
            //     colour_primaries u(8)
            //     transfer_characteristics u(8)
            //     matrix_coefficients u(8)
            //   }
            //   display_horizontal_size u(14)
            //   marker_bit f(1)
            //   display_vertical_size u(14)
            //   stereo_packing_mode u(2)
            //   next_start_code()
            // }

            // 跳过extension_start_code，读取extension_id
            reader.skipBits(32);  // 跳过extension_start_code (00 00 01 B5)
            reader.skipBits(4);   // 跳过extension_id
            
            // Read video_format (3 bits)
            const video_format = reader.readBits(3);
            
            // Read sample_range (1 bit)
            const sample_range = reader.readBits(1);
            
            // Read colour_description (1 bit)
            const colour_description_flag = reader.readBits(1) === 1;
            
            let colour_primaries: number | undefined;
            let transfer_characteristics: number | undefined;
            let matrix_coefficients: number | undefined;
            
            // If colour_description is true, read colour information
            if (colour_description_flag) {
                colour_primaries = reader.readBits(8);
                transfer_characteristics = reader.readBits(8);
                matrix_coefficients = reader.readBits(8);
            }
            
            // Read display_horizontal_size (14 bits)
            const display_horizontal_size = reader.readBits(14);
            
            // Read marker_bit (1 bit)
            reader.checkMarkerBit();
            
            // Read display_vertical_size (14 bits)
            const display_vertical_size = reader.readBits(14);
            
            // Read stereo_packing_mode (2 bits)
            const stereo_packing_mode = reader.readBits(2);
            
            // Note: next_start_code() is handled by the calling function
            
            // Validate and normalize color values if present
            let validated_primaries: ColorPrimaries | null | undefined;
            let validated_transfer: TransferCharacteristics | null | undefined;
            let validated_matrix: MatrixCoefficients | null | undefined;
            
            if (colour_description_flag) {
                validated_primaries = this.validateColorPrimaries(colour_primaries!);
                validated_transfer = this.validateTransferCharacteristics(transfer_characteristics!);
                validated_matrix = this.validateMatrixCoefficients(matrix_coefficients!);
            }

            return {
                video_format: getVideoFormatName(video_format),
                sample_range,
                colour_description: colour_description_flag && validated_primaries && validated_transfer && validated_matrix 
                    ? getCombinedColorDescription(validated_primaries, validated_transfer, validated_matrix) 
                    : undefined,
                colour_primaries: validated_primaries,
                transfer_characteristics: validated_transfer,
                matrix_coefficients: validated_matrix,
                display_horizontal_size,
                display_vertical_size,
                packing_mode: this.convertAVS1StereoPackingMode(stereo_packing_mode)
            };
            
        } catch (error) {
            console.warn(`Failed to parse sequence display extension: ${error.message}`);
            return null;
        }
    }



    /**
     * Validate and normalize color primaries value
     * 验证并规范化色彩原色值（0=禁止，1-8=有效，其他=保留）
     */
    private validateColorPrimaries(value: number): ColorPrimaries | null {
        if (value === 0) {
            return null; // 禁止
        }
        if (value >= 1 && value <= 8) {
            return value as ColorPrimaries;
        }
        return ColorPrimaries.RESERVED; // 超出范围=保留
    }

    /**
     * Validate and normalize transfer characteristics value
     * 验证并规范化传输特性值（0=禁止，1-10=有效，其他=保留）
     */
    private validateTransferCharacteristics(value: number): TransferCharacteristics | null {
        if (value === 0) {
            return null; // 禁止
        }
        if (value >= 1 && value <= 10) {
            return value as TransferCharacteristics;
        }
        return TransferCharacteristics.RESERVED; // 超出范围=保留
    }

    /**
     * Validate and normalize matrix coefficients value
     * 验证并规范化矩阵系数值（0=禁止，1-7=有效，其他=保留）
     */
    private validateMatrixCoefficients(value: number): MatrixCoefficients | null {
        if (value === 0) {
            return null; // 禁止
        }
        if (value >= 1 && value <= 7) {
            return value as MatrixCoefficients;
        }
        return MatrixCoefficients.RESERVED; // 超出范围=保留
    }

    /**
     * Get bit depth from sample precision according to AVS1 standard
     */
    private getBitDepthFromSamplePrecision(sample_precision: number): { luma_bit_depth: number, chroma_bit_depth: number } {
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
     * Parse AVS1 sequence header according to standard
     */
    parseSequenceHeader(reader: BitReader): AVS1SequenceHeader | null {
        // Skip to sequence header start code and verify
        reader.skipBits(32); // Skip sequence_start_code (00 00 01 B0)
        
        try {
            // According to AVS1 standard sequence header syntax:
            // sequence_header() {
            //   video_sequence_start_code           f(32)
            //   profile_id                          u(8) 
            //   level_id                            u(8)
            //   progressive_sequence                u(1)
            //   horizontal_size                     u(14)
            //   vertical_size                       u(14)
            //   chroma_format                       u(2)
            //   sample_precision                    u(3)
            //   aspect_ratio                        u(4)
            //   frame_rate_code                     u(4)
            //   bit_rate_lower                      u(18)
            //   marker_bit                          f(1)
            //   bit_rate_upper                      u(12)
            //   low_delay                           u(1)
            //   marker_bit                          f(1)
            //   bbv_buffer_size                     u(18)
            //   ...
            // }

            // Read profile and level
            const profile_id = reader.readBits(8);
            const level_id = reader.readBits(8);
            
            // Progressive sequence flag
            const progressive = reader.readBits(1) === 1;
            
            // Horizontal and vertical size
            const horizontal_size = reader.readBits(14);
            const vertical_size = reader.readBits(14);
            
            // Chroma format (2 bits)
            const chroma_format_value = reader.readBits(2);
            const chroma_format = chroma_format_value as ChromaFormat;
            
            // Sample precision (3 bits)
            const sample_precision = reader.readBits(3);
            
            // Aspect ratio (4 bits)
            const aspect_ratio_info = reader.readBits(4);
            
            // Frame rate code (4 bits)
            const frame_rate_code = reader.readBits(4);
            
            // Bit rate lower (18 bits) - BitRate的低18位
            const bit_rate_lower = reader.readBits(18);
            
            // Marker bit
            reader.checkMarkerBit();
            
            // Bit rate upper (12 bits) - BitRate的高12位
            const bit_rate_upper = reader.readBits(12);
            
            // Low delay flag
            const low_delay = reader.readBits(1) === 1;
            
            // Marker bit  
            reader.checkMarkerBit();
            
            // VBV buffer size (18 bits)
            const bbv_buffer_size = reader.readBits(18);

            // Additional fields for profile 0x24 (Shenzhan Profile)
            let background_picture_disable = false;
            let core_picture_disable = false;
            let core_picture_buffer_size = 0;
            let slice_set_disable = false;
            let scene_model = 0;

            if (profile_id === 0x24) { // Shenzhan Profile
                background_picture_disable = reader.readBits(1) === 1;
                core_picture_disable = reader.readBits(1) === 1;
                
                if (core_picture_disable === false) {
                    core_picture_buffer_size = reader.readBits(4);
                }
                
                slice_set_disable = reader.readBits(1) === 1;
                
                // Marker bit
                reader.checkMarkerBit();
                
                scene_model = reader.readBits(4);
                
                // Skip reserved bits
                if (core_picture_disable === false) {
                    reader.skipBits(3); // reserved_bits r(3)
                } else {
                    reader.skipBits(5); // reserved_bits r(5)
                }
            } else {
                // Skip reserved bits for other profiles
                reader.skipBits(3); // reserved_bits r(3)
            }

            // Get SAR/DAR information
            const aspect_info = getAspectRatioInfo(aspect_ratio_info);

            // Calculate final bit rate according to AVS1 standard
            const final_bit_rate = ((bit_rate_upper << 18) + bit_rate_lower) * 400;

            return {
                generation_name: profile_id === 0x48 ? 'AVS+' : 'AVS',
                profile_name: AVS1Utils.getProfileName(profile_id),
                level_name: AVS1Utils.getLevelName(level_id),
                horizontal_size,
                vertical_size,
                chroma_format,
                ...AVS1Utils.getBitDepthFromSamplePrecision(sample_precision),
                progressive,
                frame_rate: AVS1Utils.getFrameRate(frame_rate_code),
                sample_aspect_ratio: aspect_info.sar,
                display_aspect_ratio: aspect_info.dar,
                bit_rate: final_bit_rate,
                bbv_buffer_size: bbv_buffer_size,
                low_delay,
                fixed_pic_rate: !low_delay,
                // Shenzhan Profile specific fields
                background_picture_disable,
                core_picture_disable,
                core_picture_buffer_size,
                slice_set_disable,
                scene_model
            };
            
        } catch (error) {
            throw new Error(`Failed to parse AVS1 sequence header: ${error.message}`);
        }
    }

    /**
     * Analyze AVS1 bitstream and extract sequence header with optional extension
     */
    analyze(data: Uint8Array): AVS1SequenceInfo | null {
        let offset = 0;
        let sequenceHeader: AVS1SequenceHeader | null = null;
        let displayExtension: SequenceDisplayExtension | null = null;

        while (offset < data.length - 4) {
            // Look for start codes: 00 00 01 XX
            if (data[offset] === 0x00 && data[offset + 1] === 0x00 && data[offset + 2] === 0x01) {
                const startCode = data[offset + 3];
                
                if (startCode === 0xB0) {
                    // Found sequence header
                    try {
                        const reader = new BitReader(data, offset);
                        sequenceHeader = this.parseSequenceHeader(reader);
                    } catch (error) {
                        console.warn(`Failed to parse sequence header at offset ${offset}:`, error.message);
                    }
                    offset += 4;
                } else if (startCode === 0xB5) {
                    // Found extension start code - check if it's sequence display extension
                    if (offset + 4 < data.length && data[offset + 4] >> 4 === 0b0010) {
                        try {
                            const reader = new BitReader(data, offset);
                            displayExtension = this.parseSequenceDisplayExtension(reader);
                        } catch (error) {
                            console.warn(`Failed to parse extension at offset ${offset}:`, error.message);
                        }
                    }
                    offset += 4;
                } else if (startCode === 0xB3 || startCode === 0xB6) {
                    // Found picture header (I-picture or P/B-picture) - 直接退出！
                    break;
                } else {
                    // Other start codes
                    offset += 4;
                }
            } else {
                offset++;
            }
        }

        // Return result based on what we found
        if (sequenceHeader) {
            if (displayExtension) {
                return { ...sequenceHeader, ...displayExtension };
            } else {
                return sequenceHeader;
            }
        }

        return null;
    }

    /**
     * Validate if data contains AVS1 bitstream
     */
    isValidAVS1(data: Uint8Array): boolean {
        return this.findSequenceHeader(data) !== -1;
    }
}

// Utility functions
/**
 * Convert byte array to hex string for debugging
 */
function bytesToHex(bytes: Uint8Array, offset: number = 0, length: number = 16): string {
    const slice = bytes.slice(offset, offset + length);
    return Array.from(slice)
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join(' ');
}

/**
 * Find all start codes in AVS1 bitstream
 */
function findStartCodes(data: Uint8Array): number[] {
    const startCodes: number[] = [];
    
    for (let i = 0; i <= data.length - 4; i++) {
        if (data[i] === 0x00 && data[i + 1] === 0x00 && data[i + 2] === 0x01) {
            startCodes.push(i);
        }
    }
    
    return startCodes;
}

// Export the analyzer and related types
export {
    AVS1Analyzer,
    AVS1Profile,
    StereoPackingMode,
    AVS1SequenceHeader,
    SequenceDisplayExtension,
    bytesToHex,
    findStartCodes
};

// Usage example:
/*
const analyzer = new AVS1Analyzer();
const data = new Uint8Array(avs1FileBuffer);

if (analyzer.isValidAVS1(data)) {
    const sequenceInfo = analyzer.analyze(data);
    console.log('Sequence Info:', sequenceInfo);
} else {
    console.log('Not a valid AVS1 bitstream');
}
*/ 