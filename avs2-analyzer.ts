/**
 * AVS2 Analyzer - Specialized for AVS2 (Audio Video Standard 2) codec
 */

import { BitReader } from './utils.js';
import { 
    ChromaFormat, 
    ColorPrimaries, 
    TransferCharacteristics, 
    MatrixCoefficients,
    ColorDescription,
    getAspectRatioInfo,
    getVideoFormatName,
    getCombinedColorDescription,
    PackingMode,
    getDefaultWeightQuantMatrices,
} from './avs-video-common.js';
import { AVS2Utils, AVS2Profile, AVS2Level } from './avs2-common.js';

/**
 * Sequence Display Extension information for AVS2
 */
interface AVS2SequenceDisplayExtension {
    video_format: string;
    sample_range: number;
    sequence_content_description?: number;
    sde_depth_ranges: DepthRange[];
    sde_camera_parameter_sets: CameraParameterSet[];
    colour_description?: ColorDescription | null;
    colour_primaries?: ColorPrimaries | null;
    transfer_characteristics?: TransferCharacteristics | null;
    matrix_coefficients?: MatrixCoefficients | null;
    display_horizontal_size: number;
    display_vertical_size: number;
    packing_mode?: PackingMode;
    view_reverse_flag?: boolean;
}

/**
 * Parsed AVS2 sequence header information
 */
interface AVS2SequenceHeader {
    profile_id: number;
    profile_name: string;
    level_name: string;
    progressive: boolean;
    field_coded_sequence: boolean;
    horizontal_size: number;
    vertical_size: number;
    chroma_format: ChromaFormat;
    luma_bit_depth: number;
    chroma_bit_depth: number;
    encoding_luma_bit_depth?: number;
    encoding_chroma_bit_depth?: number;
    sample_aspect_ratio: string | null;
    display_aspect_ratio: string | null;
    frame_rate: number;
    bit_rate: number;
    low_delay: boolean;
    temporal_id_enable_flag: boolean;
    bbv_buffer_size: number;
    lcu_size: number;
    weight_quant_matrix_4x4?: WeightQuantMatrix4x4;
    weight_quant_matrix_8x8?: WeightQuantMatrix8x8;
    multi_hypothesis_skip_enable_flag: boolean;
    dual_hypothesis_prediction_enable_flag: boolean;
    weighted_skip_enable_flag: boolean;
    asymmetric_motion_partitions_enable_flag: boolean;
    nonsquare_quadtree_transform_enable_flag: boolean;
    nonsquare_intra_prediction_enable_flag: boolean;
    secondary_transform_enable_flag: boolean;
    sample_adaptive_offset_enable_flag: boolean;
    adaptive_leveling_filter_enable_flag: boolean;
    pmvr_enable_flag: boolean;
    num_of_rcs: number;
    reference_configuration_sets: ReferenceConfigurationSet[];
    output_reorder_delay?: number;
    cross_slice_loopfilter_enable_flag: boolean;
    universal_string_prediction_enable_flag?: boolean;
    number_of_views: number;
    global_interview_motion_vector_enable_flag?: boolean;
    local_interview_motion_vector_range: number;
    depth_gdv_from_texture_enable_flag?: boolean;
    bcbr_constrained_update_enable_flag?: boolean;
    camera_parameter_sets: CameraParameterSet[];
    min_dv?: number[];
    max_dv?: number[];
    depth_ranges: DepthRange[];
    generation_name: string;
}

/**
 * Depth Range information
 */
interface DepthRange {
    z_near_sign: number;
    z_near_exponent: number;
    z_near_mantissa: number;
    z_far_sign: number;
    z_far_exponent: number;
    z_far_mantissa: number;
}

/**
 * Type definition for a 4x4 weight quantization matrix
 */
type WeightQuantMatrix4x4 = number[][];

/**
 * Type definition for an 8x8 weight quantization matrix
 */
type WeightQuantMatrix8x8 = number[][];

/**
 * Reference Configuration Set (RCS) information
 */
interface ReferenceConfigurationSet {
    refered_by_others_flag: number;
    num_of_reference_picture: number;
    delta_doi_of_reference_picture: number[];
    num_of_removed_picture: number;
    delta_doi_of_removed_picture: number[];
}

/**
 * Camera Parameter Set information
 */
interface CameraParameterSet {
    focal_length_exponent: number;
    focal_length_mantissa: number;
    camera_position_sign: number;
    camera_position_exponent: number;
    camera_position_mantissa: number;
    camera_shift_x_exponent: number;
    camera_shift_x_mantissa: number;
    camera_shift_x_sign: number;
}


/**
 * Complete AVS2 sequence information
 */
type AVS2SequenceInfo = AVS2SequenceHeader & Partial<AVS2SequenceDisplayExtension>;


/**
 * Main AVS2 Analyzer class
 */
export class AVS2Analyzer {
    /**
     * Analyze AVS2 bitstream and extract sequence header with optional extension
     */
    public analyze(data: Uint8Array): AVS2SequenceInfo | null {
        let offset = 0;
        let sequenceHeader: AVS2SequenceHeader | null = null;
        let displayExtension: AVS2SequenceDisplayExtension | null = null;

        while (offset < data.length - 4) {
            // Look for start codes: 00 00 01 XX
            if (data[offset] === 0x00 && data[offset + 1] === 0x00 && data[offset + 2] === 0x01) {
                const startCode = data[offset + 3];
                
                if (startCode === 0xB0) { // video_sequence_start_code
                    try {
                        const reader = new BitReader(data, offset);
                        sequenceHeader = this.parseSequenceHeader(reader);
                    } catch (error) {
                        console.warn(`Failed to parse AVS2 sequence header at offset ${offset}:`, (error as Error).message);
                    }
                    offset += 4;
                } else if (startCode === 0xB5) { // extension_start_code
                    // check if it's sequence display extension
                    if (offset + 4 < data.length && data[offset + 4] >> 4 === 0b0010) {
                         if (sequenceHeader) { // Must be after a sequence header
                            try {
                                const reader = new BitReader(data, offset);
                                displayExtension = this.parseSequenceDisplayExtension(reader, sequenceHeader.profile_id, sequenceHeader.number_of_views);
                            } catch (error) {
                                console.warn(`Failed to parse AVS2 sequence display extension at offset ${offset}:`, (error as Error).message);
                            }
                        }
                    }
                    offset += 4;
                } else if (startCode === 0xB3 || startCode === 0xB6) {
                    // Picture headers, stop parsing sequence-level data.
                    break;
                } else {
                    offset += 4;
                }
            } else {
                offset++;
            }
        }

        if (sequenceHeader) {
            return { ...sequenceHeader, ...displayExtension };
        }

        return null;
    }

    /**
     * Parse AVS2 sequence header
     */
    private parseSequenceHeader(reader: BitReader): AVS2SequenceHeader {
        /*
         * AVS2 sequence_header() syntax:
         * 
         * sequence_header(){
         *   video_sequence_start_code f(32)
         *   profile_id u(8)
         *   level_id u(8)
         *   progressive_sequence u(1)
         *   field_coded_sequence u(1)
         *   horizontal_size u(14)
         *   vertical_size u(14)
         *   chroma_format u(2)
         *   sample_precision u(3)
         *   if(profile_id==0x22||profile_id==0x12||profile_id==0x32){
         *     encoding_precision u(3)
         *   }
         *   aspect_ratio u(4)
         *   frame_rate_code u(4)
         *   bit_rate_lower u(18)
         *   marker_bit f(1)
         *   bit_rate_upper u(12)
         *   low_delay u(1)
         *   marker_bit f(1)
         *   temporal_id_enable_flag u(1)
         *   bbv_buffer_size u(18)
         *   lcu_size u(3)
         *   weight_quant_enable_flag u(1)
         *   if(WeightQuantEnableFlag==1)
         *   {
         *     load_seq_weight_quant_data_flag u(1)
         *     if(load_seq_weight_quant_data_flag=='1'){
         *       weight_quant_matrix()
         *     }
         *   }
         *   scene_picture_disable_flag u(1)
         *   multi_hypothesis_skip_enable_flag u(1)
         *   dual_hypothesis_prediction_enable_flag u(1)
         *   weighted_skip_enable_flag u(1)
         *   asymmetric_motion_partitions_enable_flag u(1)
         *   nonsquare_quadtree_transform_enable_flag u(1)
         *   nonsquare_intra_prediction_enable_flag u(1)
         *   secondary_transform_enable_flag u(1)
         *   sample_adaptive_offset_enable_flag u(1)
         *   adaptive_leveling_filter_enable_flag u(1)
         *   pmvr_enable_flag u(1)
         *   marker_bit f(1)
         *   num_of_rcs u(6)
         *   for(i=0;i<NumOfRcs;i++)
         *     reference_configuration_set(i)
         *   if(low_delay=='0')
         *     output_reorder_delay u(5)
         *   cross_slice_loopfilter_enable_flag u(1)
         *   if(chroma_format=='11')
         *     universal_string_prediction_enable_flag u(1)
         *   if(profile_id==0x28||profile_id==0x2A||profile_id==0x68||profile_id==0x6A){
         *     marker_bit f(1)
         *     number_of_views_minus1 u(5)
         *     global_interview_motion_vector_enable_flag u(1)
         *     local_interview_motion_vector_range_minus1 u(3)
         *   }
         *   if(profile_id==0x68||profile_id==0x6A){
         *     depth_coding_enable_flag u(1)
         *     camera_parameter_present_flag u(1)
         *     if(camera_parameter_present_flag){ u(1)
         *       camera_parameter_change_flag
         *       if(camera_parameter_change_flag==0){ u(1)
         *         for(i=0;i<NumberViews;i++){
         *           camera_parameter_set(i)
         *         }
         *       }
         *     }
         *     if(DepthCodingEnableFlag){
         *       depth_range_change_flag u(1)
         *       if(DepthRangeChangeFlag==0){
         *         for(i=0;i<NumberViews;i++){
         *           depth_range(i)
         *         }
         *         for(i=1;i<NumberViews;i++){
         *           min_dv[i] se(v)
         *           max_dv[i] se(v)
         *         }
         *       }
         *     }
         *     if(DepthCodingEnableFlag&&GlobalDvEnableFlag)
         *       depth_gdv_from_texture_enable_flag u(1)
         *   }
         *   if((profile_id==0x30||profile_id==0x32)&&ScenePictureDisableFlag==0){
         *     scene_picture_block_update_enable_flag u(1)
         *     if(ScenePictureBlockUpdateEnableFlag==1)
         *       bcbr_constrained_update_enable_flag u(1)
         *     reserved_bits r(1)
         *   }
         *   else{
         *     reserved_bits r(2)
         *   }
         *   next_start_code()
         *  }
         */

        try {
            reader.skipBits(32); // Skip video_sequence_start_code
            const profile_id = reader.readBits(8);
            const level_id = reader.readBits(8);
            const progressive_sequence = reader.readBits(1) === 1;
            const field_coded_sequence = reader.readBits(1) === 1;
            const horizontal_size = reader.readBits(14);
            const vertical_size = reader.readBits(14);
            const chroma_format_value = reader.readBits(2);
            const chroma_format = chroma_format_value as ChromaFormat;
            const sample_precision = reader.readBits(3);

            let encoding_luma_bit_depth: number | undefined;
            let encoding_chroma_bit_depth: number | undefined;
            if (profile_id === 0x22 || profile_id === 0x12 || profile_id === 0x32) {
                const encoding_precision = reader.readBits(3);
                const bitDepths = AVS2Utils.getBitDepthFromPrecision(encoding_precision);
                encoding_luma_bit_depth = bitDepths.luma_bit_depth;
                encoding_chroma_bit_depth = bitDepths.chroma_bit_depth;
            }

            const aspect_ratio_info = reader.readBits(4);
            const { sar, dar } = getAspectRatioInfo(aspect_ratio_info);
            const frame_rate_code = reader.readBits(4);
            const bit_rate_lower = reader.readBits(18);
            reader.checkMarkerBit();
            const bit_rate_upper = reader.readBits(12);
            const low_delay = reader.readBits(1) === 1;
            reader.checkMarkerBit();
            const temporal_id_enable_flag = reader.readBits(1) === 1;
            const bbv_buffer_size = reader.readBits(18);
            const lcu_size = reader.readBits(3);
            const weight_quant_enable_flag = reader.readBits(1) === 1;

            let weight_quant_matrix_4x4: WeightQuantMatrix4x4 | undefined;
            let weight_quant_matrix_8x8: WeightQuantMatrix8x8 | undefined;
            if (weight_quant_enable_flag) {
                const load_seq_weight_quant_data_flag = reader.readBits(1) === 1;
                if (load_seq_weight_quant_data_flag) {
                    const { wqm4x4, wqm8x8 } = this.parseWeightQuantMatrix(reader);
                    weight_quant_matrix_4x4 = wqm4x4;
                    weight_quant_matrix_8x8 = wqm8x8;
                } else {
                    // 当load_seq_weight_quant_data_flag为false时，使用预置的权重量化矩阵
                    const { wqm4x4, wqm8x8 } = getDefaultWeightQuantMatrices();
                    weight_quant_matrix_4x4 = wqm4x4;
                    weight_quant_matrix_8x8 = wqm8x8;
                }
            }

            const scene_picture_disable_flag = reader.readBits(1) === 1;
            const multi_hypothesis_skip_enable_flag = reader.readBits(1) === 1;
            const dual_hypothesis_prediction_enable_flag = reader.readBits(1) === 1;
            const weighted_skip_enable_flag = reader.readBits(1) === 1;
            const asymmetric_motion_partitions_enable_flag = reader.readBits(1) === 1;
            const nonsquare_quadtree_transform_enable_flag = reader.readBits(1) === 1;
            const nonsquare_intra_prediction_enable_flag = reader.readBits(1) === 1;
            const secondary_transform_enable_flag = reader.readBits(1) === 1;
            const sample_adaptive_offset_enable_flag = reader.readBits(1) === 1;
            const adaptive_leveling_filter_enable_flag = reader.readBits(1) === 1;
            const pmvr_enable_flag = reader.readBits(1) === 1;
            reader.checkMarkerBit();
            const num_of_rcs = reader.readBits(6);

            const reference_configuration_sets = Array.from({length: num_of_rcs}, () => this.parseReferenceConfigurationSet(reader));

            let output_reorder_delay: number | undefined;
            if (!low_delay) {
                output_reorder_delay = reader.readBits(5);
            }

            const cross_slice_loopfilter_enable_flag = reader.readBits(1) === 1;
            
            let universal_string_prediction_enable_flag: boolean | undefined;
            if (chroma_format_value === 3) { // '11'
                universal_string_prediction_enable_flag = reader.readBits(1) === 1;
            }

            // --- AVS2-3D extensions (placeholders) ---
            let number_of_views_minus1: number | undefined;
            let global_interview_motion_vector_enable_flag: boolean | undefined;
            let local_interview_motion_vector_range_minus1: number | undefined;
            if (profile_id === 0x28 || profile_id === 0x2A || profile_id === 0x68 || profile_id === 0x6A) {
                reader.checkMarkerBit();
                number_of_views_minus1 = reader.readBits(5);
                global_interview_motion_vector_enable_flag = reader.readBits(1) === 1;
                local_interview_motion_vector_range_minus1 = reader.readBits(3);
            }

            const numberOfViews = (number_of_views_minus1 ?? 0) + 1;
            const local_interview_motion_vector_range = (local_interview_motion_vector_range_minus1 ?? 0) + 1;

            let depth_gdv_from_texture_enable_flag: boolean | undefined;
            let camera_parameter_sets: CameraParameterSet[] = [];
            let min_dv: number[] | undefined;
            let max_dv: number[] | undefined;
            let depth_ranges: DepthRange[] = [];
            if (profile_id === 0x68 || profile_id === 0x6A) {
                const depth_coding_enable_flag = reader.readBits(1) === 1;
                const camera_parameter_present_flag = reader.readBits(1) === 1;
                if (camera_parameter_present_flag) {
                    const camera_parameter_change_flag = reader.readBits(1);
                    if (camera_parameter_change_flag === 0) {
                        camera_parameter_sets = Array.from({length: numberOfViews}, () => this.parseCameraParameterSet(reader));
                    }
                }
                if (depth_coding_enable_flag) {
                    const depth_range_change_flag = reader.readBits(1) === 1;
                    if (!depth_range_change_flag) {
                        depth_ranges = Array.from({length: numberOfViews}, () => this.parseDepthRange(reader));
                        min_dv = Array.from({length: numberOfViews - 1}, () => reader.readSE());
                        max_dv = Array.from({length: numberOfViews - 1}, () => reader.readSE());
                    }
                }
                if (depth_coding_enable_flag && global_interview_motion_vector_enable_flag) {
                    depth_gdv_from_texture_enable_flag = reader.readBits(1) === 1;
                }
            }
            
            // --- Scene profile extensions (placeholders) ---
            let bcbr_constrained_update_enable_flag: boolean | undefined;

            if ((profile_id === 0x30 || profile_id === 0x32) && !scene_picture_disable_flag) {
                const scene_picture_block_update_enable_flag = reader.readBits(1) === 1;
                if (scene_picture_block_update_enable_flag) {
                    bcbr_constrained_update_enable_flag = reader.readBits(1) === 1;
                }
                reader.skipBits(1); // reserved_bits r(1)
            } else {
                reader.skipBits(2); // reserved_bits r(2)
            }

            // next_start_code() is handled by the caller.

            return {
                profile_id,
                generation_name: 'AVS2',
                profile_name: AVS2Utils.getProfileName(profile_id),
                level_name: AVS2Utils.getLevelName(level_id),
                progressive: progressive_sequence,
                field_coded_sequence,
                horizontal_size,
                vertical_size,
                chroma_format,
                ...AVS2Utils.getBitDepthFromPrecision(sample_precision),
                encoding_luma_bit_depth,
                encoding_chroma_bit_depth,
                sample_aspect_ratio: sar,
                display_aspect_ratio: dar,
                frame_rate: AVS2Utils.getFrameRate(frame_rate_code),
                bit_rate: ((bit_rate_upper << 18) + bit_rate_lower) * 400,
                low_delay,
                temporal_id_enable_flag,
                bbv_buffer_size,
                lcu_size,
                weight_quant_matrix_4x4,
                weight_quant_matrix_8x8,
                multi_hypothesis_skip_enable_flag,
                dual_hypothesis_prediction_enable_flag,
                weighted_skip_enable_flag,
                asymmetric_motion_partitions_enable_flag,
                nonsquare_quadtree_transform_enable_flag,
                nonsquare_intra_prediction_enable_flag,
                secondary_transform_enable_flag,
                sample_adaptive_offset_enable_flag,
                adaptive_leveling_filter_enable_flag,
                pmvr_enable_flag,
                num_of_rcs,
                reference_configuration_sets,
                output_reorder_delay,
                cross_slice_loopfilter_enable_flag,
                universal_string_prediction_enable_flag,
                number_of_views: numberOfViews,
                global_interview_motion_vector_enable_flag,
                local_interview_motion_vector_range,
                depth_gdv_from_texture_enable_flag,
                bcbr_constrained_update_enable_flag,
                camera_parameter_sets,
                min_dv,
                max_dv,
                depth_ranges,
            };
        } catch (error) {
            throw new Error(`Failed to parse AVS2 sequence header: ${(error as Error).message}`);
        }
    }

    /**
     * Parse sequence display extension for AVS2
     */
    private parseSequenceDisplayExtension(reader: BitReader, profile_id: number, numberOfViews: number): AVS2SequenceDisplayExtension | null {
        /*
         sequence_display_extension(){
           extension_id f(4)
           video_format u(3)
           sample_range u(1)
           if(profile_id==0x28||profile_id==0x2A||profile_id==0x68||profile_id==0x6A){
             sequence_content_description
             if(SequenceContentDescription=='01'||SequenceContentDescription=='10'){
               for(i=0;i<NumberViews;i++){
                 depth_range(i)
                 camera_parameter_set(i)
               }
             }
           }
           if(SequenceContentDescription=='00'||SequenceContentDescription=='10'){
             colour_description u(1)
           }
           if(ColourDescription){
             colour_primaries u(8)
             transfer_characteristics u(8)
             matrix_coefficients u(8)
           }
           display_horizontal_size u(14)
           marker_bit f(1)
           display_vertical_size u(14)
          td_mode_flag u(1)
           if(td_mode_flag=='1'){
             td_packing_mode u(8)
             view_reverse_flag u(1)
           }
           next_start_code()
          }
        */
        try {
            reader.skipBits(32); // Skip extension_start_code (00 00 01 B5)
            reader.skipBits(4);  // Skip extension_id (should be 0b0010)

            const video_format = reader.readBits(3);
            const sample_range = reader.readBits(1);

            // Per spec, SequenceContentDescription defaults to 0 if not present.
            let SequenceContentDescription = 0;
            const depth_ranges: DepthRange[] = [];
            const camera_parameter_sets: CameraParameterSet[] = [];
            
            if (profile_id === 0x28 || profile_id === 0x2A || profile_id === 0x68 || profile_id === 0x6A) {
                const sequence_content_description = reader.readBits(2);
                SequenceContentDescription = sequence_content_description;
                
                if (SequenceContentDescription === 1 || SequenceContentDescription === 2) { // '01' or '10'
                    for (let i = 0; i < numberOfViews; i++) {
                        depth_ranges.push(this.parseDepthRange(reader));
                        camera_parameter_sets.push(this.parseCameraParameterSet(reader));
                    }
                }
            }
            
            // Per spec, ColourDescription defaults to 0 if not present.
            let ColourDescription = 0;
            let validated_primaries: ColorPrimaries | undefined | null;
            let validated_transfer: TransferCharacteristics | undefined;
            let validated_matrix: MatrixCoefficients | undefined;

            if (SequenceContentDescription === 0 || SequenceContentDescription === 2) { // '00' or '10'
                const colour_description = reader.readBits(1);
                ColourDescription = colour_description;
            }

            const colour_description_flag = ColourDescription === 1;

            if (colour_description_flag) {
                const colour_primaries = reader.readBits(8);
                validated_primaries = this.validateColorPrimaries(colour_primaries);

                const transfer_characteristics = reader.readBits(8);
                validated_transfer = this.validateTransferCharacteristics(transfer_characteristics);

                const matrix_coefficients = reader.readBits(8);
                validated_matrix = this.validateMatrixCoefficients(matrix_coefficients);
            }

            const display_horizontal_size = reader.readBits(14);
            reader.checkMarkerBit();
            const display_vertical_size = reader.readBits(14);

            const td_mode_flag = reader.readBits(1) === 1;
            let td_packing_mode: number | undefined;
            let view_reverse_flag: boolean | undefined;
            if (td_mode_flag) {
                td_packing_mode = reader.readBits(8);
                view_reverse_flag = reader.readBits(1) === 1;
            }

            const packing_mode = td_mode_flag ? td_packing_mode <= 4 ? td_packing_mode as PackingMode : PackingMode.RESERVED : PackingMode.MONO;

            return {
                video_format: getVideoFormatName(video_format),
                sample_range,
                sequence_content_description: SequenceContentDescription,
                sde_depth_ranges: depth_ranges,
                sde_camera_parameter_sets: camera_parameter_sets,
                colour_description: colour_description_flag && validated_primaries && validated_transfer && validated_matrix 
                    ? getCombinedColorDescription(validated_primaries, validated_transfer, validated_matrix) 
                    : undefined,
                colour_primaries: validated_primaries,
                transfer_characteristics: validated_transfer,
                matrix_coefficients: validated_matrix,
                display_horizontal_size,
                display_vertical_size,
                packing_mode,
                view_reverse_flag,
            };
        } catch (error) {
            console.warn(`Failed to parse AVS2 sequence display extension: ${(error as Error).message}`);
            return null;
        }
    }

    /**
     * Get frame rate for AVS2 from frame rate code
     * @param frame_rate_code - 4-bit frame rate code for AVS2
     * @returns Frame rate value
     */
    private getFrameRate(frame_rate_code: number): number {
        return AVS2Utils.getFrameRate(frame_rate_code);
    }

    /**
     * Parse weight quantization matrix
     * 
     * weight_quant_matrix(){
     *   for(SizeId=0;SizeId<2;SizeId++){
     *     WQMSize=1<<(SizeId+2)
     *     for(i=0;i<WQMSize;i++){
     *       for(j=0;j<WQMSize;j++){
     *         weight_quant_coeff ue(v)
     *         if(SizeId==0)
     *           WeightQuantMatrix4x4[i][j]=WeightQuantCoeff
     *         else
     *           WeightQuantMatrix8x8[i][j]=WeightQuantCoeff
     *       }
     *     }
     *   }
     * }
     */
    private parseWeightQuantMatrix(reader: BitReader): { wqm4x4: WeightQuantMatrix4x4, wqm8x8: WeightQuantMatrix8x8 } {
        const matrices = {
            wqm4x4: Array.from({ length: 4 }, () => Array(4).fill(0)),
            wqm8x8: Array.from({ length: 8 }, () => Array(8).fill(0))
        };

        Object.entries(matrices).forEach(([key, matrix]) => {
            matrix.forEach((row, i) => {
                row.forEach((_, j) => {
                    matrix[i][j] = reader.readUE();
                });
            });
        });

        return matrices;
    }

    /**
     * Parse reference configuration set
     * 
     * reference_configuration_set(i){
     *   refered_by_others_flag[i] u(1)
     *   num_of_reference_picture[i] u(3)
     *   for(j=0;j<NumOfReferencePicture[i];j++)
     *     delta_doi_of_reference_picture[i][j] u(6)
     *   num_of_removed_picture[i] u(3)
     *   for(j=0;j<NumOfRemovedPicture[i];j++)
     *     delta_doi_of_removed_picture[i][j] u(6)
     *   marker_bit f(1)
     * }
     */
    private parseReferenceConfigurationSet(reader: BitReader): ReferenceConfigurationSet {
        const refered_by_others_flag = reader.readBits(1);
        const num_of_reference_picture = reader.readBits(3);
        const delta_doi_of_reference_picture: number[] = [];
        for (let j = 0; j < num_of_reference_picture; j++) {
            delta_doi_of_reference_picture.push(reader.readBits(6));
        }

        const num_of_removed_picture = reader.readBits(3);
        const delta_doi_of_removed_picture: number[] = [];
        for (let j = 0; j < num_of_removed_picture; j++) {
            delta_doi_of_removed_picture.push(reader.readBits(6));
        }
        
        reader.checkMarkerBit(); // marker_bit f(1)

        return {
            refered_by_others_flag,
            num_of_reference_picture,
            delta_doi_of_reference_picture,
            num_of_removed_picture,
            delta_doi_of_removed_picture,
        };
    }

    /**
     * Parse depth range
     *
     * depth_range(viewIdx){
     *   z_near_sign[viewIdx] u(1)
     *   z_near_exponent[viewIdx] u(8)
     *   marker_bit f(1)
     *   z_near_mantissa[viewIdx] u(22)
     *   marker_bit f(1)
     *   z_far_sign[viewIdx] u(1)
     *   z_far_exponent[viewIdx] u(8)
     *   marker_bit f(1)
     *   z_far_mantissa[viewIdx] u(22)
     *   marker_bit f(1)
     * }
     */
    private parseDepthRange(reader: BitReader): DepthRange {
        const z_near_sign = reader.readBits(1);
        const z_near_exponent = reader.readBits(8);
        reader.checkMarkerBit();
        const z_near_mantissa = reader.readBits(22);
        reader.checkMarkerBit();
        const z_far_sign = reader.readBits(1);
        const z_far_exponent = reader.readBits(8);
        reader.checkMarkerBit();
        const z_far_mantissa = reader.readBits(22);
        reader.checkMarkerBit();

        return {
            z_near_sign,
            z_near_exponent,
            z_near_mantissa,
            z_far_sign,
            z_far_exponent,
            z_far_mantissa,
        };
    }

    /**
     * Parse camera parameter set
     * 
     * camera_parameter_set(viewIdx){
     *   focal_length_exponent[viewIdx] u(8)
     *   marker_bit f(1)
     *   focal_length_mantissa[viewIdx] u(22)
     *   marker_bit f(1)
     *   camera_position_sign[viewIdx] u(1)
     *   camera_position_exponent[viewIdx] u(8)
     *   marker_bit f(1)
     *   camera_position_mantissa[viewIdx] u(22)
     *   marker_bit f(1)
     *   camera_shift_x_exponent[viewIdx] u(8)
     *   marker_bit f(1)
     *   camera_shift_x_mantissa[viewIdx] u(22)
     *   marker_bit f(1)
     *   camera_shift_x_sign[viewIdx] u(1)
     *   marker_bit f(1)
     * }
     */
    private parseCameraParameterSet(reader: BitReader): CameraParameterSet {
        const focal_length_exponent = reader.readBits(8);
        reader.checkMarkerBit();
        const focal_length_mantissa = reader.readBits(22);
        reader.checkMarkerBit();
        const camera_position_sign = reader.readBits(1);
        const camera_position_exponent = reader.readBits(8);
        reader.checkMarkerBit();
        const camera_position_mantissa = reader.readBits(22);
        reader.checkMarkerBit();
        const camera_shift_x_exponent = reader.readBits(8);
        reader.checkMarkerBit();
        const camera_shift_x_mantissa = reader.readBits(22);
        reader.checkMarkerBit();
        const camera_shift_x_sign = reader.readBits(1);
        reader.checkMarkerBit();

        return {
            focal_length_exponent,
            focal_length_mantissa,
            camera_position_sign,
            camera_position_exponent,
            camera_position_mantissa,
            camera_shift_x_exponent,
            camera_shift_x_mantissa,
            camera_shift_x_sign,
        };
    }

    private getBitDepthFromPrecision(id: number): { luma_bit_depth: number, chroma_bit_depth: number } {
        return AVS2Utils.getBitDepthFromPrecision(id);
    }

    private getProfileName(profileId: number): string {
        return AVS2Utils.getProfileName(profileId);
    }

    private getLevelName(levelId: number): string {
        return AVS2Utils.getLevelName(levelId);
    }

    // Other helper methods will be added here, e.g., for getting profile/level names
    private validateColorPrimaries(value: number): ColorPrimaries | null {
        if (value === 0) {
            return null; // Forbidden
        }
        return value as ColorPrimaries;
    }

    private validateTransferCharacteristics(value: number): TransferCharacteristics | null {
        if (value === 0) {
            return null; // Forbidden
        }
        return value as TransferCharacteristics;
    }

    private validateMatrixCoefficients(value: number): MatrixCoefficients | null {
        if (value === 0) {
            return null; // Forbidden
        }
        return value as MatrixCoefficients;
    }
} 