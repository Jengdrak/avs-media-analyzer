export class BitReader {
    private buffer: Uint8Array;
    private bytePosition: number = 0;
    private bitPosition: number = 0;

    constructor(buffer: Uint8Array, startOffset: number = 0) {
        this.buffer = buffer;
        this.bytePosition = startOffset;
    }

    public readBits(n: number): number {
        if (n > 32) {
            throw new Error("Cannot read more than 32 bits at a time");
        }
        if (n === 0) {
            return 0;
        }

        let result = 0;
        let bitsToRead = n;

        while (bitsToRead > 0) {
            if (this.bytePosition >= this.buffer.length) {
                throw new Error("Reading past end of buffer");
            }

            const bitsLeftInByte = 8 - this.bitPosition;
            const bitsToReadInThisStep = Math.min(bitsToRead, bitsLeftInByte);

            const mask = (1 << bitsToReadInThisStep) - 1;
            const byte = this.buffer[this.bytePosition];
            const shift = bitsLeftInByte - bitsToReadInThisStep;
            const value = (byte >> shift) & mask;
            
            result = (result << bitsToReadInThisStep) | value;

            this.bitPosition += bitsToReadInThisStep;
            if (this.bitPosition === 8) {
                this.bitPosition = 0;
                this.bytePosition++;
            }

            bitsToRead -= bitsToReadInThisStep;
        }
        return result;
    }

    public readBit(): number {
        if (this.bytePosition >= this.buffer.length) {
            throw new Error("Reading past end of buffer");
        }

        const byte = this.buffer[this.bytePosition];
        const bit = (byte >> (7 - this.bitPosition)) & 1;

        this.bitPosition++;
        if (this.bitPosition === 8) {
            this.bitPosition = 0;
            this.bytePosition++;
        }

        return bit;
    }

    public skipBits(n: number): void {
        const totalBitsOffset = this.bytePosition * 8 + this.bitPosition + n;
        this.bytePosition = Math.floor(totalBitsOffset / 8);
        this.bitPosition = totalBitsOffset % 8;
    }

    public byteAlign(): void {
        if (this.bitPosition !== 0) {
            this.bitPosition = 0;
            this.bytePosition++;
        }
    }

    public getPosition(): { byte: number, bit: number } {
        return { byte: this.bytePosition, bit: this.bitPosition };
    }

    public hasMoreData(): boolean {
        return this.bytePosition < this.buffer.length;
    }

    public checkMarkerBit(): void {
        if (this.readBit() !== 1) {
            throw new Error('Marker bit validation failed: expected 1.');
        }
    }

    /**
     * Reads an unsigned exponential-Golomb coded syntax element ue(v).
     */
    public readUE(): number {
        let leadingZeroBits = 0;
        while (this.readBit() === 0) {
            leadingZeroBits++;
            if (leadingZeroBits > 31) {
                throw new Error("Invalid Exp-Golomb code: too many leading zeros.");
            }
        }
        
        const codeNum = this.readBits(leadingZeroBits);
        return (1 << leadingZeroBits) - 1 + codeNum;
    }

    /**
     * Reads a signed exponential-Golomb coded syntax element se(v).
     */
    public readSE(): number {
        const codeNum = this.readUE();
        if (codeNum === 0) {
            return 0;
        }

        const isPositive = (codeNum % 2) !== 0;
        const value = Math.ceil(codeNum / 2);

        return isPositive ? value : -value;
    }

    /**
     * Reads a single bit and returns it as a boolean value.
     */
    public readBoolean(): boolean {
        return this.readBit() === 1;
    }
} 