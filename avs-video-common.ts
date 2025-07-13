/**
 * AVS Video Common - Shared definitions for AVS video codec standards
 * 包含各个AVS标准（AVS1、AVS2、AVS3等）的共用枚举和类型定义
 */

/**
 * Chroma format types - 色度格式（各AVS标准共用）
 */
export enum ChromaFormat {
    RESERVED = 0,
    YUV420 = 1,         // 4:2:0 (most common)
    YUV422 = 2,         // 4:2:2  
    YUV444 = 3,         // 4:4:4
}

/**
 * Color primaries according to AVS standards - 各AVS标准共用
 */
export enum ColorPrimaries {
    GY_T_155_2000 = 1,      // GY/T 155-2000
    UNSPECIFIED = 2,        // Unspecified
    RESERVED = 3,           // Reserved
    BT470_2_SYSTEM_M = 4,   // BT.470-2 System M
    BT470_2_SYSTEM_BG = 5,  // BT.470-2 System B/G
    SMPTE170M = 6,          // SMPTE 170M
    SMPTE240M = 7,          // SMPTE 240M
    GENERIC_FILM = 8,       // Generic Film
    BT2020 = 9             // BT.2020
}

/**
 * Transfer characteristics according to AVS standards - 各AVS标准共用
 */
export enum TransferCharacteristics {
    GY_T_155_2000 = 1,      // GY/T 155-2000
    UNSPECIFIED = 2,        // Unspecified
    RESERVED = 3,           // Reserved
    BT470_2_SYSTEM_M = 4,   // BT.470-2 System M
    BT470_2_SYSTEM_BG = 5,  // BT.470-2 System B/G
    SMPTE170M = 6,          // SMPTE 170M
    SMPTE240M = 7,          // SMPTE 240M
    LINEAR = 8,             // Linear
    LOG_100 = 9,            // Lg 100
    LOG_316_227 = 10,       // Lg 316.227
    BT2020_12bit = 11,      // BT.2020 12-bit
    PQ = 12,                 // PQ
    AVS2_APPENDIX_F4 = 13,   // AVS2 Appendix F.4
    HLG = 14                 // HLG
}

/**
 * Matrix coefficients according to AVS standards - 各AVS标准共用
 */
export enum MatrixCoefficients {
    GY_T_155_2000 = 1,      // GY/T 155-2000
    UNSPECIFIED = 2,        // Unspecified
    RESERVED = 3,           // Reserved
    FCC = 4,                // FCC
    BT470_2_SYSTEM_BG = 5,  // BT.470-2 System B/G
    SMPTE170M = 6,          // SMPTE 170M
    SMPTE240M = 7,          // SMPTE 240M
    BT2020_NCL = 8,         // BT.2020 NCL
    BT2020_CL = 9,           // BT.2020 CL
    YR_EQUAL = 10,           // E_Y = E_R
    AVS2_APPENDIX_G3 = 11,   // AVS2 Appendix G.3
}

/**
 * Color description for when all three values are equal - 各AVS标准共用
 */
export enum ColorDescription {
    GY_T_155_2000 = 1,      // GY/T 155-2000
    UNSPECIFIED = 2,        // Unspecified
    RESERVED = 3,           // Reserved
    FCC = 4,                // FCC
    BT470_2_SYSTEM_BG = 5,  // BT.470-2 System B/G
    SMPTE170M = 6,          // SMPTE 170M
    SMPTE240M = 7,          // SMPTE 240M
    BT709                   // BT.709 (special case: primaries=1, transfer=6, matrix=1)
}

/**
 * HDR Dynamic Metadata Type for AVS3
 */
export enum HDRDynamicMetadataType {
    HDR_VIVID = 5,          // HDR Vivid动态元数据
    Reserved
}

/**
 * Aspect ratio information type - 宽高比信息类型
 */
export type AspectRatioInfo = {
    sar: string | null;  // Sample Aspect Ratio - 样本宽高比
    dar: string | null;  // Display Aspect Ratio - 显示宽高比
};

/**
 * Get chroma format name
 */
export function getChromaFormatName(format: ChromaFormat): string {
    switch (format) {
        case ChromaFormat.YUV420: return 'YUV 4:2:0';
        case ChromaFormat.YUV422: return 'YUV 4:2:2';
        case ChromaFormat.YUV444: return 'YUV 4:4:4';
        case ChromaFormat.RESERVED: return '保留 (Reserved)';
        default: return 'Unknown';
    }
}

/**
 * Get aspect ratio information according to AVS standards
 * 根据AVS标准获取宽高比信息（各AVS标准共用）
 * @param aspectRatioInfo - 4-bit aspect ratio information (0-15)
 * @returns SAR and DAR information
 */
export function getAspectRatioInfo(aspectRatioInfo: number): AspectRatioInfo {
    switch (aspectRatioInfo) {
        case 0b0000: return { sar: null, dar: null };                              // 0000: 禁止
        case 0b0001: return { sar: '1.0', dar: null };                             // 0001: 样本宽高比 1:0
        case 0b0010: return { sar: null, dar: '4:3' };                             // 0010: 显示宽高比 4÷3
        case 0b0011: return { sar: null, dar: '16:9' };                            // 0011: 显示宽高比 16÷9
        case 0b0100: return { sar: null, dar: '2.21:1' };                          // 0100: 显示宽高比 2.21÷1
        default: return { sar: null, dar: null };                                  // 0101~1111: 保留
    }
}

/**
 * Frame rate table for all AVS standards (各AVS标准共用帧率表)
 * Complete standard frame rates - individual analyzers subset as needed
 * 完整的标准帧率表 - 各分析器根据需要进行截取
 * Index corresponds to 4-bit frame rate code (0-14)
 * 索引对应4位帧率码（0-14）
 */
export const FRAME_RATES = [
    0,      // 0000: forbidden
    23.976, // 0001: 23.976... (24000/1001)
    24,     // 0010: 24
    25,     // 0011: 25
    29.97,  // 0100: 29.97... (30000/1001)
    30,     // 0101: 30
    50,     // 0110: 50
    59.94,  // 0111: 59.94... (60000/1001)
    60,     // 1000: 60
    100,    // 1001: 100
    120,    // 1010: 120
    200,    // 1011: 200
    240,    // 1100: 240
    300,    // 1101: 300
    119.88, // 1110: 119.88... (120000/1001)
];

/**
 * Get video format name according to AVS standards
 * 根据AVS标准获取视频格式名称（各AVS标准共用）
 * @param videoFormat - 3-bit video format code (0-7)
 * @returns Video format name
 */
export function getVideoFormatName(videoFormat: number): string {
    switch (videoFormat) {
        case 0b000: return '分量信号 (Component)';
        case 0b001: return 'PAL';
        case 0b010: return 'NTSC';
        case 0b011: return 'SECAM';
        case 0b100: return 'MAC';
        case 0b101: return '未作规定的视频格式 (Unspecified video format)';
        case 0b110: return '保留 (Reserved)';
        case 0b111: return '保留 (Reserved)';
        default: return `Unknown Video Format (0b${videoFormat.toString(2).padStart(3, '0')})`;
    }
}

/**
 * Get color primaries name from enum
 * 获取色彩原色名称（各AVS标准共用）
 */
export function getColorPrimariesName(primaries: ColorPrimaries | number): string {
    switch (primaries) {
        case ColorPrimaries.GY_T_155_2000: return 'GY/T 155-2000';
        case ColorPrimaries.UNSPECIFIED: return 'Unspecified';
        case ColorPrimaries.RESERVED: return 'Reserved';
        case ColorPrimaries.BT470_2_SYSTEM_M: return 'BT.470-2 System M';
        case ColorPrimaries.BT470_2_SYSTEM_BG: return 'BT.470-2 System B/G';
        case ColorPrimaries.SMPTE170M: return 'SMPTE 170M';
        case ColorPrimaries.SMPTE240M: return 'SMPTE 240M';
        case ColorPrimaries.GENERIC_FILM: return 'Generic Film';
        case ColorPrimaries.BT2020: return 'BT.2020';
        default: return 'Unknown Color Primaries';
    }
}

/**
 * Get transfer characteristics name from enum
 * 获取传输特性名称（各AVS标准共用）
 */
export function getTransferCharacteristicsName(characteristics: TransferCharacteristics | number): string {
    switch (characteristics) {
        case TransferCharacteristics.GY_T_155_2000: return 'GY/T 155-2000';
        case TransferCharacteristics.UNSPECIFIED: return 'Unspecified';
        case TransferCharacteristics.RESERVED: return 'Reserved';
        case TransferCharacteristics.BT470_2_SYSTEM_M: return 'BT.470-2 System M';
        case TransferCharacteristics.BT470_2_SYSTEM_BG: return 'BT.470-2 System B/G';
        case TransferCharacteristics.SMPTE170M: return 'SMPTE 170M';
        case TransferCharacteristics.SMPTE240M: return 'SMPTE 240M';
        case TransferCharacteristics.LINEAR: return 'Linear';
        case TransferCharacteristics.LOG_100: return 'Lg 100';
        case TransferCharacteristics.LOG_316_227: return 'Lg 316.227';
        case TransferCharacteristics.BT2020_12bit: return 'BT.2020 12-bit';
        case TransferCharacteristics.PQ: return 'PQ';
        case TransferCharacteristics.AVS2_APPENDIX_F4: return 'AVS2 Appendix F.4';
        case TransferCharacteristics.HLG: return 'HLG';
        default: return 'Unknown Transfer Characteristics';
    }
}

/**
 * Get matrix coefficients name from enum
 * 获取矩阵系数名称（各AVS标准共用）
 */
export function getMatrixCoefficientsName(coefficients: MatrixCoefficients | number): string {
    switch (coefficients) {
        case MatrixCoefficients.GY_T_155_2000: return 'GY/T 155-2000';
        case MatrixCoefficients.UNSPECIFIED: return 'Unspecified';
        case MatrixCoefficients.RESERVED: return 'Reserved';
        case MatrixCoefficients.FCC: return 'FCC';
        case MatrixCoefficients.BT470_2_SYSTEM_BG: return 'BT.470-2 System B/G';
        case MatrixCoefficients.SMPTE170M: return 'SMPTE 170M';
        case MatrixCoefficients.SMPTE240M: return 'SMPTE 240M';
        case MatrixCoefficients.BT2020_NCL: return 'BT.2020 NCL';
        case MatrixCoefficients.BT2020_CL: return 'BT.2020 CL';
        case MatrixCoefficients.YR_EQUAL: return 'E_Y = E_R';
        case MatrixCoefficients.AVS2_APPENDIX_G3: return 'AVS2 Appendix G.3';
        default: return 'Unknown Matrix Coefficients';
    }
}

/**
 * Get color description name from enum
 * 获取颜色描述名称（各AVS标准共用）
 */
export function getColorDescriptionName(description: ColorDescription | number): string {
    switch (description) {
        case ColorDescription.GY_T_155_2000: return 'GY/T 155-2000';
        case ColorDescription.UNSPECIFIED: return 'Unspecified';
        case ColorDescription.RESERVED: return 'Reserved';
        case ColorDescription.FCC: return 'FCC';
        case ColorDescription.BT470_2_SYSTEM_BG: return 'BT.470-2 System B/G';
        case ColorDescription.SMPTE170M: return 'SMPTE 170M';
        case ColorDescription.SMPTE240M: return 'SMPTE 240M';
        case ColorDescription.BT709: return 'BT.709';
        default: return 'Unknown Color Description';
    }
}

/**
 * Get HDR dynamic metadata type name from enum
 * 获取HDR动态元数据类型名称（AVS3专用）
 */
export function getHDRDynamicMetadataTypeName(type: HDRDynamicMetadataType | number): string {
    switch (type) {
        case HDRDynamicMetadataType.HDR_VIVID: return 'HDR Vivid';
        default: return '保留';
    }
}

/**
 * Get combined color description from individual color components
 * 从分项颜色信息获取组合颜色描述（各AVS标准共用）
 * @param primaries - Color primaries enum
 * @param transfer - Transfer characteristics enum  
 * @param matrix - Matrix coefficients enum
 * @returns Combined color description enum if all three match, null otherwise
 */
export function getCombinedColorDescription(
    primaries: ColorPrimaries, 
    transfer: TransferCharacteristics, 
    matrix: MatrixCoefficients
): ColorDescription | null {
    // Convert enums to numbers for comparison
    const primariesValue = primaries as number;
    const transferValue = transfer as number;
    const matrixValue = matrix as number;
    
    // Special case: BT.709 (primaries=1, transfer=6, matrix=1)
    if (primariesValue === 1 && transferValue === 6 && matrixValue === 1) {
        return ColorDescription.BT709;
    }
    
    // Check if all three values are equal and map to ColorDescription
    if (primariesValue === transferValue && transferValue === matrixValue) {
        // Map the common value to ColorDescription enum
        switch (primariesValue) {
            case ColorPrimaries.GY_T_155_2000: return ColorDescription.GY_T_155_2000;
            case ColorPrimaries.UNSPECIFIED: return ColorDescription.UNSPECIFIED;
            case ColorPrimaries.RESERVED: return ColorDescription.RESERVED;
            case ColorPrimaries.BT470_2_SYSTEM_BG: return ColorDescription.BT470_2_SYSTEM_BG;
            case ColorPrimaries.SMPTE170M: return ColorDescription.SMPTE170M;
            case ColorPrimaries.SMPTE240M: return ColorDescription.SMPTE240M;
            // Note: BT2020 and other new values don't have matching ColorDescription enum values
            default: return null; // No matching ColorDescription for this value
        }
    }
    return null; // Values don't match
} 

/**
 * 3D packing modes for AVS standards - 3D封装模式（各AVS标准共用）
 */
export enum PackingMode {
    SBS = 0,          // Side-by-Side (左右拼接)
    OU = 1,           // Over-Under (上下拼接)
    QUAD = 2,         // Quad View (四视点拼接)
    TD_OU = 3,        // Texture+Depth Over-Under (单视点纹理深度上下拼接)
    TD_SBS = 4,       // Texture+Depth Side-by-Side (单视点纹理深度左右拼接)
    MONO,
    RESERVED
}

/**
 * Get packing mode name in English
 * 获取3D封装模式英文名称
 */
export function getPackingModeNameEN(mode: PackingMode | number): string {
    switch (mode) {
        case PackingMode.MONO: return 'Mono';
        case PackingMode.SBS: return 'Side-by-Side';
        case PackingMode.OU: return 'Over-Under';
        case PackingMode.QUAD: return 'Quad View';
        case PackingMode.TD_OU: return 'Texture+Depth Over-Under';
        case PackingMode.TD_SBS: return 'Texture+Depth Side-by-Side';
        case PackingMode.RESERVED: return 'Reserved';
        default: return `Unknown Packing Mode (${mode})`;
    }
}

/**
 * Get packing mode name in Chinese
 * 获取3D封装模式中文名称
 */
export function getPackingModeNameZH(mode: PackingMode | number): string {
    switch (mode) {
        case PackingMode.MONO: return '单目视频';
        case PackingMode.SBS: return '左右拼接';
        case PackingMode.OU: return '上下拼接';
        case PackingMode.QUAD: return '四视点拼接';
        case PackingMode.TD_OU: return '单视点纹理深度上下拼接';
        case PackingMode.TD_SBS: return '单视点纹理深度左右拼接';
        case PackingMode.RESERVED: return '保留';
        default: return `未知封装模式 (${mode})`;
    }
}

/**
 * Default weight quantization matrices for AVS2 and AVS3
 * 当load_seq_weight_quant_data_flag为false时使用的预置权重量化矩阵
 */

/**
 * Default 4x4 weight quantization matrix
 * 预置的4x4权重量化矩阵
 */
export const DEFAULT_WEIGHT_QUANT_MATRIX_4X4: number[][] = [
    [64, 64, 64, 68],
    [64, 64, 68, 72],
    [64, 68, 76, 80],
    [72, 76, 84, 96]
];

/**
 * Default 8x8 weight quantization matrix
 * 预置的8x8权重量化矩阵
 */
export const DEFAULT_WEIGHT_QUANT_MATRIX_8X8: number[][] = [
    [64, 64, 64, 64, 68, 68, 72, 76],
    [64, 64, 64, 68, 72, 76, 84, 92],
    [64, 64, 68, 72, 76, 80, 88, 100],
    [64, 68, 72, 80, 84, 92, 100, 112],
    [68, 72, 80, 84, 92, 104, 112, 128],
    [76, 80, 84, 92, 104, 116, 132, 152],
    [96, 100, 104, 116, 124, 140, 164, 188],
    [104, 108, 116, 128, 152, 172, 192, 216]
];

/**
 * Get default weight quantization matrices
 * 获取预置的权重量化矩阵
 * @returns Object containing 4x4 and 8x8 default matrices
 */
export function getDefaultWeightQuantMatrices(): { 
    wqm4x4: number[][], 
    wqm8x8: number[][] 
} {
    return {
        wqm4x4: DEFAULT_WEIGHT_QUANT_MATRIX_4X4.map(row => [...row]),
        wqm8x8: DEFAULT_WEIGHT_QUANT_MATRIX_8X8.map(row => [...row])
    };
} 

 