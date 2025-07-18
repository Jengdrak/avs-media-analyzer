# AVS Media Analyzer

[简体中文](README.zh-Hans.md) | [English](README.en.md)

AVS/AVS2/AVS3/Audio Vivid metadata parser

## Supported Formats

- **MPEG-TS formats** (.ts, .m2ts): Complete AVS/AVS2/AVS3/Audio Vivid metadata parsing
- **ISOBMFF formats** (.mp4, .mov, .m4v): Complete AVS2/AVS3/Audio Vivid metadata parsing (lacking AVS2/AVS3 test files)
- **Other formats** (.mkv, .webm, .flv, .wmv, .avi): Complete AVS/AVS2/AVS3/Audio Vivid metadata parsing

> Other formats use [bilibili/web-demuxer](https://github.com/bilibili/web-demuxer) to extract streams

## Online Usage

🔗 [https://jengdrak.github.io/avs-media-analyzer/](https://jengdrak.github.io/avs-media-analyzer/)

## Reference Standards

### AVS

- `GB/T 20090.2-2013` Information technology―Advanced coding of audio and video―Part 2: Video
- `GB/T 20090.16-2016` Information technology—Advanced coding of audio and video—Part 16: Broadcasting video

### AVS2

- `GB/T 33475.2-2024` Information technology—High efficiency multimedia coding—Part 2: Video

### AVS3

- `T/AI 109.2—2021` Information technology Intelligent media coding Part 2: Video
- `GY/T 368-2023` Advanced and efficient video coding

### Audio Vivid

- `T/AI 109.3—2023` Information technology - Intelligent media coding - Part 3: Immersive audio
- `GY/T 363—2023` 3D audio coding and rendering

### MPEG-TS
- `GB/T 20090.1-2012` Information technology - Advanced coding of audio and video - Part 1: System
- `GY/T 299.1—2016` Technical requirements of ultra-high-definition video and audio encoding streams encapsulation for network transmission