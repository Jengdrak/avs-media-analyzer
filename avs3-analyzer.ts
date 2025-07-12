/**
 * AVS3 Analyzer - Specialized for AVS3 (Audio Video Standard 3) codec
 */

import { BitReader } from './utils.js';
import { 
    ChromaFormat, 
    ColorPrimaries, 
    TransferCharacteristics, 
    MatrixCoefficients,
    ColorDescription,
    HDRDynamicMetadataType,
    getAspectRatioInfo,
    getVideoFormatName,
    getCombinedColorDescription,
    PackingMode,
    getDefaultWeightQuantMatrices
} from './avs-video-common.js';
import { AVS3Utils, AVS3Profile, AVS3Level } from './avs3-common.js';

/**
 * Reference Picture List Set information
 */
interface ReferencePictureListSet {
    reference_to_library_enable_flag?: boolean;
    library_index_flag: boolean[];
    referenced_library_picture_index: number[];
    delta_doi: number[];
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
 * Parsed AVS3 sequence header information
 */
interface AVS3SequenceHeader {
    generation_name: string;
    profile_id: number;
    profile_name: string;
    level_name: string;
    progressive: boolean;
    field_coded_sequence: boolean;
    library_stream_flag: boolean;
    library_picture_enable_flag?: boolean;
    duplicate_sequence_header_flag?: boolean;
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
    max_dpb: number;
    rpl1_index_exist_flag: boolean;
    rpl1_same_as_rpl0_flag: boolean;
    reference_picture_list_sets: ReferencePictureListSet[][];
    num_ref_default_active: number[];
    log2_lcu_size: number;
    log2_min_cu_size: number;
    log2_max_part_ratio: number;
    max_split_times: number;
    log2_min_qt_size: number;
    log2_max_bt_size: number;
    log2_max_eqt_size: number;
    weight_quant_enable_flag: boolean;
    weight_quant_matrix_4x4?: WeightQuantMatrix4x4;
    weight_quant_matrix_8x8?: WeightQuantMatrix8x8;
    st_enable_flag: boolean;
    sao_enable_flag: boolean;
    alf_enable_flag: boolean;
    affine_enable_flag: boolean;
    smvd_enable_flag: boolean;
    ipcm_enable_flag: boolean;
    amvr_enable_flag: boolean;
    num_of_hmvp_cand: number;
    umve_enable_flag: boolean;
    emvr_enable_flag?: boolean;
    intra_pf_enable_flag: boolean;
    tscpm_enable_flag: boolean;
    dt_enable_flag: boolean;
    log2_max_dt_size?: number;
    pbt_enable_flag: boolean;
    // Enhanced profile flags
    eipm_enable_flag: boolean;
    mipf_enable_flag: boolean;
    intra_pf_chroma_enable_flag: boolean;
    umve_enhancement_enable_flag: boolean;
    affine_umve_enable_flag: boolean;
    sb_tmvp_enable_flag: boolean;
    srcc_enable_flag: boolean;
    enhanced_st_enable_flag: boolean;
    enhanced_tscpm_enable_flag: boolean;
    maec_enable_flag: boolean;
    pmc_enable_flag?: boolean;
    iip_enable_flag?: boolean;
    sawp_enable_flag?: boolean;
    asr_enable_flag?: boolean;
    awp_enable_flag?: boolean;
    etmvp_mvap_enable_flag?: boolean;
    dmvr_enable_flag?: boolean;
    bio_enable_flag?: boolean;
    bgc_enable_flag?: boolean;
    inter_pf_enable_flag?: boolean;
    inter_pc_enable_flag?: boolean;
    obmc_enable_flag?: boolean;
    sbt_enable_flag?: boolean;
    ist_enable_flag?: boolean;
    esao_enable_flag?: boolean;
    ccsao_enable_flag?: boolean;
    ealf_enable_flag?: boolean;
    ibc_enable_flag?: boolean;
    isc_enable_flag?: boolean;
    num_of_intra_hmvp_cand?: number;
    fimc_enable_flag?: boolean;
    nn_tools_set_hook: number;
    num_of_nn_filter: number;
    output_reorder_delay?: number;
    cross_patch_loop_filter_enable_flag: boolean;
    ref_colocated_patch_flag: boolean;
    stable_patch_flag: boolean;
    uniform_patch_flag?: boolean;
    patch_width?: number;
    patch_height?: number;
}

/**
 * AVS3 Sequence Display Extension information
 */
interface AVS3SequenceDisplayExtension {
    video_format: string;
    sample_range: number;
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
 * AVS3 HDR Dynamic Metadata Extension information
 */
interface AVS3HDRDynamicMetadataExtension {
    hdr_dynamic_metadata_type: HDRDynamicMetadataType;
}

/**
 * Complete AVS3 sequence information
 */
type AVS3SequenceInfo = AVS3SequenceHeader & Partial<AVS3SequenceDisplayExtension> & Partial<AVS3HDRDynamicMetadataExtension>;

/**
 * Main AVS3 Analyzer class
 */
export class AVS3Analyzer {
    private convertAVS3PackingMode(td_mode_flag: boolean, td_packing_mode: number): PackingMode {
        return td_packing_mode ? td_packing_mode <= 2 ? td_packing_mode as PackingMode : PackingMode.RESERVED : PackingMode.MONO;
    }
    
    /**
     * Analyze AVS3 bitstream and extract sequence header
     */
    public analyze(data: Uint8Array): AVS3SequenceInfo | null {
        let offset = 0;
        let sequenceHeader: AVS3SequenceHeader | null = null;
        let displayExtension: AVS3SequenceDisplayExtension | null = null;
        let hdrDynamicMetadataExtension: AVS3HDRDynamicMetadataExtension | null = null;

        while (offset < data.length - 4) {
            // Look for start codes: 00 00 01 XX
            if (data[offset] === 0x00 && data[offset + 1] === 0x00 && data[offset + 2] === 0x01) {
                const startCode = data[offset + 3];
                
                if (startCode === 0xB0) { // video_sequence_start_code
                    try {
                        const reader = new BitReader(data, offset);
                        sequenceHeader = this.parseSequenceHeader(reader);
                    } catch (error) {
                        console.warn(`Failed to parse AVS3 sequence header at offset ${offset}:`, (error as Error).message);
                    }
                    offset += 4;
                } else if (startCode === 0xB5) { // extension_start_code
                    if (offset + 4 < data.length) {
                        const extension_id = data[offset + 4] >> 4;
                        
                        if (extension_id === 0b0010) { // sequence display extension
                            if (sequenceHeader) { // Must be after a sequence header
                                try {
                                    const reader = new BitReader(data, offset);
                                    displayExtension = this.parseSequenceDisplayExtension(reader);
                                } catch (error) {
                                    console.warn(`Failed to parse AVS3 sequence display extension at offset ${offset}:`, (error as Error).message);
                                }
                            }
                        } else if (extension_id === 0b0101) { // HDR dynamic metadata extension
                            if (sequenceHeader) { // Must be after a sequence header
                                try {
                                    const reader = new BitReader(data, offset);
                                    hdrDynamicMetadataExtension = this.parseHDRDynamicMetadataExtension(reader);
                                } catch (error) {
                                    console.warn(`Failed to parse AVS3 HDR dynamic metadata extension at offset ${offset}:`, (error as Error).message);
                                }
                            }
                        }
                    }
                    offset += 4;
                } else if (startCode === 0xB3 || startCode === 0xB6) {
                    // Picture headers, stop parsing sequence-level data
                    break;
                } else {
                    offset += 4;
                }
            } else {
                offset++;
            }
        }

        if (sequenceHeader) {
            return { ...sequenceHeader, ...displayExtension, ...hdrDynamicMetadataExtension };
        }

        return null;
    }

    /**
     * Parse AVS3 sequence header according to the provided pseudocode
     * 
     * Complete AVS3 sequence header pseudocode:
     * 
     * video_sequence_start_code f(32) 
     * profile_id u(8) 
     * level_id u(8) 
     * progressive_sequence u(1) 
     * field_coded_sequence u(1) 
     * library_stream_flag u(1) 
     * if (! LibraryStreamFlag) {  
     *   library_picture_enable_flag u(1) 
     *   if (LibraryPictureEnableFlag) {  
     *     duplicate_sequence_header_flag u(1) 
     *   }  
     * }  
     * marker_bit f(1) 
     * horizontal_size u(14) 
     * marker_bit f(1) 
     * vertical_size u(14) 
     * chroma_format u(2) 
     * sample_precision u(3) 
     * if (profile_id == 0x22 || profile_id == 0x32) {  
     *   encoding_precision u(3) 
     * }  
     * marker_bit f(1) 
     * aspect_ratio u(4) 
     * frame_rate_code u(4) 
     * marker_bit f(1) 
     * bit_rate_lower u(18) 
     * marker_bit f(1) 
     * bit_rate_upper u(12) 
     * low_delay u(1) 
     * temporal_id_enable_flag u(1) 
     * marker_bit f(1) 
     * bbv_buffer_size u(18) 
     * marker_bit f(1) 
     * max_dpb_minus1 ue(v) 
     * rpl1_index_exist_flag u(1) 
     * rpl1_same_as_rpl0_flag u(1) 
     * marker_bit f(1) 
     * num_ref_pic_list_set[0] ue(v) 
     * for (j = 0; j < NumRefPicListSet[0]; j++) {  
     *   reference_picture_list_set(0, j)  
     * }  
     * if (! Rpl1SameAsRpl0Flag) {  
     *   num_ref_pic_list_set[1] ue(v) 
     *   for (j = 0; j < NumRefPicListSet[1]; j++) {  
     *     reference_picture_list_set(1, j)  
     *   }  
     * }  
     * num_ref_default_active_minus1[0] ue(v) 
     * num_ref_default_active_minus1[1] ue(v) 
     * log2_lcu_size_minus2 u(3) 
     * log2_min_cu_size_minus2 u(2) 
     * log2_max_part_ratio_minus2 u(2) 
     * max_split_times_minus6 u(3) 
     * log2_min_qt_size_minus2 u(3) 
     * log2_max_bt_size_minus2 u(3) 
     * log2_max_eqt_size_minus3 u(2) 
     * marker_bit f(1) 
     * weight_quant_enable_flag u(1) 
     * if (WeightQuantEnableFlag) {  
     *   load_seq_weight_quant_data_flag u(1) 
     *   if (load_seq_weight_quant_data_flag == '1') {  
     *     weight_quant_matrix( )   
     *   }
     * }  
     * st_enable_flag u(1) 
     * sao_enable_flag u(1) 
     * alf_enable_flag u(1) 
     * affine_enable_flag u(1) 
     * smvd_enable_flag u(1) 
     * ipcm_enable_flag u(1) 
     * amvr_enable_flag u(1) 
     * num_of_hmvp_cand u(4) 
     * umve_enable_flag u(1) 
     * if ((NumOfHmvpCand != 0) && AmvrEnableFlag) {  
     *   emvr_enable_flag u(1) 
     * }  
     * intra_pf_enable_flag u(1) 
     * tscpm_enable_flag u(1) 
     * marker_bit f(1) 
     * dt_enable_flag u(1) 
     * if (DtEnableFlag) {  
     *   log2_max_dt_size_minus4 u(2) 
     * }  
     * pbt_enable_flag u(1) 
     * EipmEnableFlag = 0  
     * MipfEnableFlag = 0  
     * IntraPfChromaEnableFlag = 0  
     * UmveEnhancementEnableFlag = 0  
     * AffineUmveEnableFlag = 0  
     * SbTmvpEnableFlag = 0  
     * SrccEnableFlag = 0  
     * EnhancedStEnableFlag = 0  
     * EnhancedTscpmEnableFlag = 0  
     * MaecEnableFlag = 0  
     * if (profile_id == 0x30 || profile_id == 0x32) {  
     *   EipmEnableFlag = 1  
     *   pmc_enable_flag u(1) 
     *   if (TscpmEnableFlag) {  
     *     EnhancedTscpmEnableFlag = 1  
     *   }  
     *   iip_enable_flag u(1) 
     *   sawp_enable_flag u(1) 
     *   MipfEnableFlag = 1  
     *   if (IntraPfEnableFlag) {  
     *     IntraPfChromaEnableFlag = 1  
     *   }  
     *   if (UmveEnableFlag) {  
     *     UmveEnhancementEnableFlag = 1  
     *   }  
     *   if (AffineEnableFlag) {  
     *     AffineUmveEnableFlag = 1  
     *   }  
     *   if (AffineEnableFlag) {  
     *     asr_enable_flag u(1) 
     *   }  
     *   awp_enable_flag u(1) 
     *   SbTmvpEnableFlag = 1  
     *   etmvp_mvap_enable_flag u(1) 
     *   dmvr_enable_flag u(1) 
     *   bio_enable_flag u(1) 
     *   bgc_enable_flag u(1) 
     *   inter_pf_enable_flag u(1) 
     *   inter_pc_enable_flag u(1) 
     *   obmc_enable_flag u(1) 
     *   if (StEnableFlag) {  
     *     EnhancedStEnableFlag = 1  
     *   }  
     *   sbt_enable_flag u(1) 
     *   ist_enable_flag u(1) 
     *   SrccEnableFlag = 1  
     *   MaecEnableFlag = 1  
     *   esao_enable_flag u(1) 
     *   ccsao_enable_flag u(1) 
     *   if (EsaoEnableFlag) {  
     *     SaoEnableFlag = 0  
     *   }  
     *   if (AlfEnableFlag) {  
     *     ealf_enable_flag u(1) 
     *   } 
     *   ibc_enable_flag u(1) 
     *   marker_bit u(1) 
     *   isc_enable_flag u(1) 
     *   if (IbcEnableFlag || IscEnableFlag) {  
     *     num_of_intra_hmvp_cand u(4) 
     *   }  
     *   fimc_enable_flag u(1) 
     *   nn_tools_set_hook u(8) 
     *   if (NnFilterEnableFlag) {  
     *     num_of_nn_filter_minus1 ue(v) 
     *   }  
     *   marker_bit u(1) 
     * }  
     * if (low_delay == '0')  
     *   output_reorder_delay u(5) 
     * cross_patch_loop_filter_enable_flag u(1) 
     * ref_colocated_patch_flag u(1) 
     * stable_patch_flag u(1) 
     * if (stable_patch_flag == '1') {  
     *   uniform_patch_flag u(1) 
     *   if (uniform_patch_flag == '1') {  
     *     marker_bit f(1) 
     *     patch_width_minus1 ue(v) 
     *     patch_height_minus1 ue(v) 
     *   }  
     * }  
     * reserved_bits r(2) 
     * next_start_code( )  
     */
    private parseSequenceHeader(reader: BitReader): AVS3SequenceHeader {
        try {
            reader.skipBits(32);
            
            const profile_id = reader.readBits(8);
            const level_id = reader.readBits(8);
            const progressive_sequence = reader.readBits(1) === 1;
            const field_coded_sequence = reader.readBits(1) === 1;
            const library_stream_flag = reader.readBits(1) === 1;
            
            let library_picture_enable_flag: boolean | undefined;
            let duplicate_sequence_header_flag: boolean | undefined;
            
            if (!library_stream_flag) {
                library_picture_enable_flag = reader.readBits(1) === 1;
                
                if (library_picture_enable_flag) {
                    duplicate_sequence_header_flag = reader.readBits(1) === 1;
                }
            }
            
            reader.checkMarkerBit();
            const horizontal_size = reader.readBits(14);
            reader.checkMarkerBit();
            const vertical_size = reader.readBits(14);
            
            const chroma_format_value = reader.readBits(2);
            const chroma_format = chroma_format_value as ChromaFormat;
            
            const sample_precision = reader.readBits(3);
            const bitDepthInfo = AVS3Utils.getBitDepthFromPrecision(sample_precision);
            
            let encoding_precision: number | undefined;
            
            if (profile_id === 0x22 || profile_id === 0x32) {
                encoding_precision = reader.readBits(3);
            }
            
            reader.checkMarkerBit();
            const aspect_ratio = reader.readBits(4);
            const aspectRatioInfo = getAspectRatioInfo(aspect_ratio);
            
            const frame_rate_code = reader.readBits(4);
            const frame_rate = AVS3Utils.getFrameRate(frame_rate_code);
            
            reader.checkMarkerBit();
            const bit_rate_lower = reader.readBits(18);
            reader.checkMarkerBit();
            const bit_rate_upper = reader.readBits(12);
            
            const low_delay = reader.readBits(1) === 1;
            const temporal_id_enable_flag = reader.readBits(1) === 1;
            
            reader.checkMarkerBit();
            const bbv_buffer_size = reader.readBits(18);
            reader.checkMarkerBit();
            const max_dpb = reader.readUE() + 1;
            
            const rpl1_index_exist_flag = reader.readBits(1) === 1;
            const rpl1_same_as_rpl0_flag = reader.readBits(1) === 1;
            
            reader.checkMarkerBit();
            const num_ref_pic_list_set_0 = reader.readUE();
            
            const reference_picture_list_sets: ReferencePictureListSet[][] = [];
            
            reference_picture_list_sets.push(Array.from({length: num_ref_pic_list_set_0}, () => this.parseReferencePictureListSet(reader, library_picture_enable_flag)));
            
            if (!rpl1_same_as_rpl0_flag) {
                const num_ref_pic_list_set_1 = reader.readUE();
                reference_picture_list_sets.push(Array.from({length: num_ref_pic_list_set_1}, () => this.parseReferencePictureListSet(reader, library_picture_enable_flag)));
            }
            
            const num_ref_default_active_0 = reader.readUE() + 1;
            const num_ref_default_active_1 = reader.readUE() + 1;
            const num_ref_default_active = [num_ref_default_active_0, num_ref_default_active_1];
            
            const log2_lcu_size = reader.readBits(3) + 2;
            const log2_min_cu_size = reader.readBits(2) + 2;
            const log2_max_part_ratio = reader.readBits(2) + 2;
            const max_split_times = reader.readBits(3) + 6;
            const log2_min_qt_size = reader.readBits(3) + 2;
            const log2_max_bt_size = reader.readBits(3) + 2;
            const log2_max_eqt_size = reader.readBits(2) + 3;
            
            reader.checkMarkerBit();
            
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
            
            const st_enable_flag = reader.readBits(1) === 1;
            const sao_enable_flag = reader.readBits(1) === 1;
            const alf_enable_flag = reader.readBits(1) === 1;
            const affine_enable_flag = reader.readBits(1) === 1;
            const smvd_enable_flag = reader.readBits(1) === 1;
            const ipcm_enable_flag = reader.readBits(1) === 1;
            const amvr_enable_flag = reader.readBits(1) === 1;
            const num_of_hmvp_cand = reader.readBits(4);
            const umve_enable_flag = reader.readBits(1) === 1;
            
            let emvr_enable_flag: boolean | undefined;
            
            if (num_of_hmvp_cand !== 0 && amvr_enable_flag) {
                emvr_enable_flag = reader.readBits(1) === 1;
            }
            
            const intra_pf_enable_flag = reader.readBits(1) === 1;
            const tscpm_enable_flag = reader.readBits(1) === 1;
            
            try {
                reader.checkMarkerBit();
            } catch (error) {
                console.log('Marker bit check failed');
            }
            
            const dt_enable_flag = reader.readBits(1) === 1;
            
            let log2_max_dt_size: number | undefined;
            
            if (dt_enable_flag) {
                log2_max_dt_size = reader.readBits(2) + 4;
            }
            
            const pbt_enable_flag = reader.readBits(1) === 1;
            
            let eipm_enable_flag = false;
            let mipf_enable_flag = false;
            let intra_pf_chroma_enable_flag = false;
            let umve_enhancement_enable_flag = false;
            let affine_umve_enable_flag = false;
            let sb_tmvp_enable_flag = false;
            let srcc_enable_flag = false;
            let enhanced_st_enable_flag = false;
            let enhanced_tscpm_enable_flag = false;
            let maec_enable_flag = false;
            
            let pmc_enable_flag: boolean | undefined;
            let iip_enable_flag: boolean | undefined;
            let sawp_enable_flag: boolean | undefined;
            let asr_enable_flag: boolean | undefined;
            let awp_enable_flag: boolean | undefined;
            let etmvp_mvap_enable_flag: boolean | undefined;
            let dmvr_enable_flag: boolean | undefined;
            let bio_enable_flag: boolean | undefined;
            let bgc_enable_flag: boolean | undefined;
            let inter_pf_enable_flag: boolean | undefined;
            let inter_pc_enable_flag: boolean | undefined;
            let obmc_enable_flag: boolean | undefined;
            let sbt_enable_flag: boolean | undefined;
            let ist_enable_flag: boolean | undefined;
            let esao_enable_flag: boolean | undefined;
            let ccsao_enable_flag: boolean | undefined;
            let ealf_enable_flag: boolean | undefined;
            let ibc_enable_flag: boolean | undefined;
            let isc_enable_flag: boolean | undefined;
            let num_of_intra_hmvp_cand: number | undefined;
            let fimc_enable_flag: boolean | undefined;
            let nn_tools_set_hook = 0;
            let num_of_nn_filter = 0;
            
            if (profile_id === 0x30 || profile_id === 0x32) {
                eipm_enable_flag = true;
                
                pmc_enable_flag = reader.readBits(1) === 1;
                
                if (tscpm_enable_flag) {
                    enhanced_tscpm_enable_flag = true;
                }
                
                iip_enable_flag = reader.readBits(1) === 1;
                sawp_enable_flag = reader.readBits(1) === 1;
                
                mipf_enable_flag = true;
                
                if (intra_pf_enable_flag) {
                    intra_pf_chroma_enable_flag = true;
                }
                
                if (umve_enable_flag) {
                    umve_enhancement_enable_flag = true;
                }
                
                if (affine_enable_flag) {
                    affine_umve_enable_flag = true;
                }
                
                if (affine_enable_flag) {
                    asr_enable_flag = reader.readBits(1) === 1;
                }
                
                awp_enable_flag = reader.readBits(1) === 1;
                
                sb_tmvp_enable_flag = true;
                
                etmvp_mvap_enable_flag = reader.readBits(1) === 1;
                dmvr_enable_flag = reader.readBits(1) === 1;
                bio_enable_flag = reader.readBits(1) === 1;
                bgc_enable_flag = reader.readBits(1) === 1;
                inter_pf_enable_flag = reader.readBits(1) === 1;
                inter_pc_enable_flag = reader.readBits(1) === 1;
                obmc_enable_flag = reader.readBits(1) === 1;
                
                if (st_enable_flag) {
                    enhanced_st_enable_flag = true;
                }
                
                sbt_enable_flag = reader.readBits(1) === 1;
                ist_enable_flag = reader.readBits(1) === 1;
                
                srcc_enable_flag = true;
                maec_enable_flag = true;
                
                esao_enable_flag = reader.readBits(1) === 1;
                ccsao_enable_flag = reader.readBits(1) === 1;
                
                if (esao_enable_flag) {
                    // SaoEnableFlag = 0 (logic variable, not read from bitstream)
                }
                
                if (alf_enable_flag) {
                    ealf_enable_flag = reader.readBits(1) === 1;
                }
                
                ibc_enable_flag = reader.readBits(1) === 1;
                
                reader.checkMarkerBit();
                
                isc_enable_flag = reader.readBits(1) === 1;
                
                if (ibc_enable_flag || isc_enable_flag) {
                    num_of_intra_hmvp_cand = reader.readBits(4);
                }
                
                fimc_enable_flag = reader.readBits(1) === 1;
                nn_tools_set_hook = reader.readBits(8);
                
                const nn_filter_enable_flag = (nn_tools_set_hook & 0x01) === 1;
                
                if (nn_filter_enable_flag) {
                    num_of_nn_filter = reader.readUE() + 1;
                }
                
                reader.checkMarkerBit();
            }
            
            let output_reorder_delay: number | undefined;
            
            if (!low_delay) {
                output_reorder_delay = reader.readBits(5);
            }
            
            const cross_patch_loop_filter_enable_flag = reader.readBits(1) === 1;
            const ref_colocated_patch_flag = reader.readBits(1) === 1;
            const stable_patch_flag = reader.readBits(1) === 1;
            
            let uniform_patch_flag: boolean | undefined;
            let patch_width: number | undefined;
            let patch_height: number | undefined;
            
            if (stable_patch_flag) {
                uniform_patch_flag = reader.readBits(1) === 1;
                
                if (uniform_patch_flag) {
                    reader.checkMarkerBit();
                    patch_width = reader.readUE() + 1;
                    patch_height = reader.readUE() + 1;
                }
            }
            
            reader.skipBits(2);
            
            // Calculate encoding bit depths if encoding_precision is present
            let encoding_luma_bit_depth: number | undefined;
            let encoding_chroma_bit_depth: number | undefined;
            if (encoding_precision !== undefined) {
                const encodingBitDepthInfo = AVS3Utils.getBitDepthFromPrecision(encoding_precision);
                encoding_luma_bit_depth = encodingBitDepthInfo.luma_bit_depth;
                encoding_chroma_bit_depth = encodingBitDepthInfo.chroma_bit_depth;
            }
            
            return {
                generation_name: 'AVS3',
                profile_id,
                profile_name: AVS3Utils.getProfileName(profile_id),
                level_name: AVS3Utils.getLevelName(level_id),
                progressive: progressive_sequence,
                field_coded_sequence,
                library_stream_flag,
                library_picture_enable_flag,
                duplicate_sequence_header_flag,
                horizontal_size,
                vertical_size,
                chroma_format,
                luma_bit_depth: bitDepthInfo.luma_bit_depth,
                chroma_bit_depth: bitDepthInfo.chroma_bit_depth,
                encoding_luma_bit_depth,
                encoding_chroma_bit_depth,
                sample_aspect_ratio: aspectRatioInfo.sar,
                display_aspect_ratio: aspectRatioInfo.dar,
                frame_rate,
                bit_rate: ((bit_rate_upper << 18) + bit_rate_lower) * 400,
                low_delay,
                temporal_id_enable_flag,
                bbv_buffer_size,
                max_dpb,
                rpl1_index_exist_flag,
                rpl1_same_as_rpl0_flag,
                reference_picture_list_sets,
                num_ref_default_active,
                log2_lcu_size,
                log2_min_cu_size,
                log2_max_part_ratio,
                max_split_times,
                log2_min_qt_size,
                log2_max_bt_size,
                log2_max_eqt_size,
                weight_quant_enable_flag,
                weight_quant_matrix_4x4,
                weight_quant_matrix_8x8,
                st_enable_flag,
                sao_enable_flag,
                alf_enable_flag,
                affine_enable_flag,
                smvd_enable_flag,
                ipcm_enable_flag,
                amvr_enable_flag,
                num_of_hmvp_cand,
                umve_enable_flag,
                emvr_enable_flag,
                intra_pf_enable_flag,
                tscpm_enable_flag,
                dt_enable_flag,
                log2_max_dt_size,
                pbt_enable_flag,
                eipm_enable_flag,
                mipf_enable_flag,
                intra_pf_chroma_enable_flag,
                umve_enhancement_enable_flag,
                affine_umve_enable_flag,
                sb_tmvp_enable_flag,
                srcc_enable_flag,
                enhanced_st_enable_flag,
                enhanced_tscpm_enable_flag,
                maec_enable_flag,
                pmc_enable_flag,
                iip_enable_flag,
                sawp_enable_flag,
                asr_enable_flag,
                awp_enable_flag,
                etmvp_mvap_enable_flag,
                dmvr_enable_flag,
                bio_enable_flag,
                bgc_enable_flag,
                inter_pf_enable_flag,
                inter_pc_enable_flag,
                obmc_enable_flag,
                sbt_enable_flag,
                ist_enable_flag,
                esao_enable_flag,
                ccsao_enable_flag,
                ealf_enable_flag,
                ibc_enable_flag,
                isc_enable_flag,
                num_of_intra_hmvp_cand,
                fimc_enable_flag,
                nn_tools_set_hook,
                num_of_nn_filter,
                output_reorder_delay,
                cross_patch_loop_filter_enable_flag,
                ref_colocated_patch_flag,
                stable_patch_flag,
                uniform_patch_flag,
                patch_width,
                patch_height,
            };
            
        } catch (error) {
            throw new Error(`Failed to parse AVS3 sequence header: ${(error as Error).message}`);
        }
    }

    /**
     * Parse weight quantization matrix
     * 
     * weight_quant_matrix(){
     *   for(sizeId=0;sizeId<2;sizeId++){
     *     WQMSize=1<<(sizeId+2)
     *     for(i=0;i<WQMSize;i++){
     *       for(j=0;j<WQMSize;j++){
     *         weight_quant_coeff ue(v)
     *         if(sizeId==0)
     *           WeightQuantMatrix4x4[i][j]=WeightQuantCoeff
     *         else
     *           WeightQuantMatrix8x8[i][j]=WeightQuantCoeff
     *       }
     *     }
     *   }
     * }
     */
    private parseWeightQuantMatrix(reader: BitReader):  { wqm4x4: WeightQuantMatrix4x4, wqm8x8: WeightQuantMatrix8x8 }  {
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
     * Parse reference picture list set
     * 
     * reference_picture_list_set(list, rpls) { 
     *   if (LibraryPictureEnableFlag) {
     *     reference_to_library_enable_flag u(1) 
     *   }  
     *   num_of_ref_pic[list][rpls] ue(v) 
     *   for (i = 0; i < NumOfRefPic[list][rpls]; i++) {  
     *     if (ReferenceToLibraryEnableFlag) {  
     *       library_index_flag[list][rpls][i] u(1) 
     *     }  
     *     if (LibraryIndexFlag[list][rpls][i]) {  
     *       referenced_library_picture_index[list][rpls][i] ue(v) 
     *     }  
     *     else {  
     *       abs_delta_doi[list][rpls][i] ue(v) 
     *       if (abs_delta_doi[list][rpls][i] > 0) {  
     *         sign_delta_doi[list][rpls][i] u(1) 
     *       }  
     *     }  
     *   }  
     * }
     */
    private parseReferencePictureListSet(reader: BitReader, library_picture_enable_flag?: boolean): ReferencePictureListSet {
        const reference_to_library_enable_flag = library_picture_enable_flag && reader.readBits(1) === 1;
        const num_of_ref_pic = reader.readUE();
        
        const library_index_flag: boolean[] = [];
        const referenced_library_picture_index: number[] = [];
        const delta_doi: number[] = [];
        
        for (let i = 0; i < num_of_ref_pic; i++) {
            library_index_flag[i] = reference_to_library_enable_flag && reader.readBits(1) === 1;
            
            if (library_index_flag[i]) {
                referenced_library_picture_index[i] = reader.readUE();
            } else {
                let delta = reader.readUE();
                if (delta > 0) {
                    const sign = reader.readBits(1) === 1;
                    if(sign) {
                        delta = -delta;
                    }
                }
                delta_doi[i] = delta;
            }
        }
        
        return {
            reference_to_library_enable_flag,
            library_index_flag,
            referenced_library_picture_index,
            delta_doi
        };
    }

    /**
     * Parse AVS3 sequence display extension
     * 
     * sequence_display_extension( ) {  
     *   extension_id f(4) 
     *   video_format u(3) 
     *   sample_range u(1) 
     *   colour_description u(1) 
     *   if (colour_description) {  
     *     colour_primaries u(8) 
     *     transfer_characteristics u(8) 
     *     matrix_coefficients u(8) 
     *   }  
     *   display_horizontal_size u(14) 
     *   marker_bit f(1) 
     *   display_vertical_size u(14) 
     *   td_mode_flag u(1) 
     *   if (td_mode_flag == '1') {  
     *     td_packing_mode u(8) 
     *     view_reverse_flag u(1) 
     *   }  
     *   next_start_code( )  
     * }
     */
    private parseSequenceDisplayExtension(reader: BitReader): AVS3SequenceDisplayExtension | null {
        try {
            reader.skipBits(32); // Skip extension_start_code (00 00 01 B5)
            reader.skipBits(4);  // Skip extension_id (should be 0b0010)

            const video_format = reader.readBits(3);
            const sample_range = reader.readBits(1);
            const colour_description_flag = reader.readBits(1) === 1;

            let colour_primaries: number | undefined;
            let transfer_characteristics: number | undefined;
            let matrix_coefficients: number | undefined;

            if (colour_description_flag) {
                colour_primaries = reader.readBits(8);
                transfer_characteristics = reader.readBits(8);
                matrix_coefficients = reader.readBits(8);
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

            // Validate and normalize color values if present
            let validated_primaries: ColorPrimaries | null | undefined;
            let validated_transfer: TransferCharacteristics | null | undefined;
            let validated_matrix: MatrixCoefficients | null | undefined;

            if (colour_description_flag) {
                validated_primaries = AVS3Utils.getColorPrimaries(colour_primaries!);
                validated_transfer = AVS3Utils.getTransferCharacteristics(transfer_characteristics!);
                validated_matrix = AVS3Utils.getMatrixCoefficients(matrix_coefficients!);
            }

            const packing_mode = td_mode_flag ? td_packing_mode <= 2 ? td_packing_mode as PackingMode : PackingMode.RESERVED : PackingMode.MONO;

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
                packing_mode,
                view_reverse_flag,
            };

        } catch (error) {
            console.warn(`Failed to parse AVS3 sequence display extension: ${(error as Error).message}`);
            return null;
        }
    }

    /**
     * Parse AVS3 HDR dynamic metadata extension
     * 
     * hdr_dynamic_metadata_extension( ) {  
     *   extension_id f(4) 
     *   hdr_dynamic_metadata_type u(4) 
     *   while ( next_bits(24) != '0000 0000 0000 0000 0000 0001') {  
     *     extension_data_byte u(8) 
     *   }  
     *   next_start_code()  
     * }
     */
    private parseHDRDynamicMetadataExtension(reader: BitReader): AVS3HDRDynamicMetadataExtension | null {
        try {
            reader.skipBits(32); // Skip extension_start_code (00 00 01 B5)
            reader.skipBits(4);  // Skip extension_id (should be 0b0101)

            const hdr_dynamic_metadata_type = reader.readBits(4);

            return {
                hdr_dynamic_metadata_type: hdr_dynamic_metadata_type == 5 ? HDRDynamicMetadataType.HDR_VIVID : HDRDynamicMetadataType.Reserved
            };

        } catch (error) {
            console.warn(`Failed to parse AVS3 HDR dynamic metadata extension: ${(error as Error).message}`);
            return null;
        }
    }
} 