/* SPDX-License-Identifier: GPL-3.0-only
 * Copyright 2026 LG XMEye Viewer contributors.
 * One decoder instance per Web Worker; FFmpeg is built from pinned sources.
 */
#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <emscripten.h>
#include <libavcodec/avcodec.h>
#include <libavutil/error.h>
#include <libavutil/log.h>
#include <libavutil/pixfmt.h>

#define VIEWER_MAX_PACKET (16 * 1024 * 1024)
#define VIEWER_MAX_PIXELS (1920 * 1080)

static AVCodecContext *decoder;
static AVFrame *frame;
static AVPacket *packet;
static char last_error[192];

EM_JS(void, viewer_output, (int width, int height, const uint8_t *y, int ys,
                           const uint8_t *u, int us, const uint8_t *v, int vs,
                           double pts), {
    Module['onFrame'](width, height, y, ys, u, us, v, vs, pts);
});

static int fail(int code, const char *operation) {
    char detail[AV_ERROR_MAX_STRING_SIZE];
    av_strerror(code, detail, sizeof(detail));
    snprintf(last_error, sizeof(last_error), "%s: %s", operation, detail);
    return code;
}

EMSCRIPTEN_KEEPALIVE const char *viewer_error(void) {
    return last_error;
}

EMSCRIPTEN_KEEPALIVE void viewer_destroy(void) {
    av_packet_free(&packet);
    av_frame_free(&frame);
    avcodec_free_context(&decoder);
}

EMSCRIPTEN_KEEPALIVE int viewer_create(int codec) {
    viewer_destroy();
    last_error[0] = 0;
    av_log_set_level(AV_LOG_QUIET);
    enum AVCodecID id = codec == 264 ? AV_CODEC_ID_H264 : codec == 265 ? AV_CODEC_ID_HEVC : AV_CODEC_ID_NONE;
    const AVCodec *implementation = avcodec_find_decoder(id);
    if (!implementation) return fail(AVERROR_DECODER_NOT_FOUND, "codec");
    decoder = avcodec_alloc_context3(implementation);
    frame = av_frame_alloc();
    packet = av_packet_alloc();
    if (!decoder || !frame || !packet) {
        viewer_destroy();
        return fail(AVERROR(ENOMEM), "allocate decoder");
    }
    decoder->thread_count = 1;
    decoder->thread_type = 0;
    decoder->max_pixels = VIEWER_MAX_PIXELS;
    int result = avcodec_open2(decoder, implementation, NULL);
    if (result < 0) { viewer_destroy(); return fail(result, "open decoder"); }
    return 0;
}

static int receive_frames(void) {
    for (;;) {
        int result = avcodec_receive_frame(decoder, frame);
        if (result == AVERROR(EAGAIN) || result == AVERROR_EOF) return 0;
        if (result < 0) return fail(result, "decode frame");
        if (frame->width <= 0 || frame->height <= 0 ||
            (int64_t)frame->width * frame->height > VIEWER_MAX_PIXELS) {
            av_frame_unref(frame);
            return fail(AVERROR(EINVAL), "software video exceeds 1920x1080 pixel budget");
        }
        if (frame->format != AV_PIX_FMT_YUV420P && frame->format != AV_PIX_FMT_YUVJ420P) {
            av_frame_unref(frame);
            return fail(AVERROR(ENOSYS), "software video requires 8-bit YUV420");
        }
        viewer_output(frame->width, frame->height,
                      frame->data[0], frame->linesize[0],
                      frame->data[1], frame->linesize[1],
                      frame->data[2], frame->linesize[2],
                      frame->pts == AV_NOPTS_VALUE ? 0 : (double)frame->pts);
        av_frame_unref(frame);
    }
}

EMSCRIPTEN_KEEPALIVE int viewer_decode(const uint8_t *data, int size, int key, int pts) {
    if (!decoder || !data || size <= 0 || size > VIEWER_MAX_PACKET)
        return fail(AVERROR(EINVAL), "invalid packet");
    av_packet_unref(packet);
    int result = av_new_packet(packet, size);
    if (result < 0) return fail(result, "allocate packet");
    memcpy(packet->data, data, size);
    packet->pts = pts;
    packet->dts = AV_NOPTS_VALUE;
    if (key) packet->flags |= AV_PKT_FLAG_KEY;
    result = avcodec_send_packet(decoder, packet);
    if (result == AVERROR(EAGAIN)) {
        result = receive_frames();
        if (result >= 0) result = avcodec_send_packet(decoder, packet);
    }
    av_packet_unref(packet);
    if (result < 0) return fail(result, "send packet");
    return receive_frames();
}

EMSCRIPTEN_KEEPALIVE int viewer_flush(void) {
    if (!decoder) return fail(AVERROR(EINVAL), "decoder not initialized");
    int result = avcodec_send_packet(decoder, NULL);
    if (result == AVERROR_EOF) return 0;
    if (result < 0) return fail(result, "flush decoder");
    return receive_frames();
}
