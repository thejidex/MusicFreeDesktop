#import <React/RCTBridgeModule.h>
#import <AVFoundation/AVFoundation.h>
#import <CommonCrypto/CommonDigest.h>

// Read metadata through AVFoundation inside the application's Files sandbox.
@interface Mp3Util : NSObject <RCTBridgeModule>
@end
@implementation Mp3Util
RCT_EXPORT_MODULE();
+ (BOOL)requiresMainQueueSetup { return NO; }
- (dispatch_queue_t)methodQueue { return dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0); }
- (AVURLAsset *)asset:(NSString *)path {
    NSURL *url = [path hasPrefix:@"file://"] ? [NSURL URLWithString:path] : [NSURL fileURLWithPath:path];
    return [AVURLAsset URLAssetWithURL:url options:nil];
}
- (NSDictionary *)metadata:(NSString *)path {
    AVURLAsset *asset = [self asset:path];
    NSMutableDictionary *result = [NSMutableDictionary dictionary];
    NSDictionary *keys = @{AVMetadataCommonKeyTitle:@"title", AVMetadataCommonKeyArtist:@"artist", AVMetadataCommonKeyAlbumName:@"album"};
    for (AVMetadataItem *item in asset.commonMetadata) {
        NSString *key = item.commonKey ? keys[item.commonKey] : nil;
        if (key && item.stringValue) result[key] = item.stringValue;
    }
    double seconds = CMTimeGetSeconds(asset.duration);
    result[@"duration"] = [NSString stringWithFormat:@"%.0f", isfinite(seconds) ? seconds * 1000 : 0];
    NSString *lyrics = [self lyric:asset];
    if (lyrics.length) result[@"lyric"] = lyrics;
    return result;
}
- (NSString *)lyric:(AVAsset *)asset {
    for (NSString *format in asset.availableMetadataFormats) {
        for (AVMetadataItem *item in [asset metadataForFormat:format]) {
            NSString *identifier = [item.identifier lowercaseString];
            if ([identifier containsString:@"lyrics"] || [identifier containsString:@"uslt"]) {
                if (item.stringValue) return item.stringValue;
            }
        }
    }
    return @"";
}
RCT_REMAP_METHOD(getBasicMeta, getBasicMeta:(NSString *)path resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
    resolve([self metadata:path]);
}
RCT_REMAP_METHOD(getMediaMeta, getMediaMeta:(NSArray<NSString *> *)paths resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
    NSMutableArray *items = [NSMutableArray array];
    for (NSString *path in paths) [items addObject:[self metadata:path]];
    resolve(items);
}
RCT_REMAP_METHOD(getMediaTag, getMediaTag:(NSString *)path resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
    resolve([self metadata:path]);
}
RCT_REMAP_METHOD(getLyric, getLyric:(NSString *)path resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
    resolve([self lyric:[self asset:path]]);
}
RCT_REMAP_METHOD(getMediaCoverImg, getMediaCoverImg:(NSString *)path resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
    AVURLAsset *asset = [self asset:path];
    for (AVMetadataItem *item in asset.commonMetadata) {
        if ([item.commonKey isEqual:AVMetadataCommonKeyArtwork] && item.dataValue) {
            const char *input = path.UTF8String;
            unsigned char digest[CC_SHA256_DIGEST_LENGTH];
            CC_SHA256(input, (CC_LONG)strlen(input), digest);
            NSMutableString *name = [NSMutableString string];
            for (int i = 0; i < CC_SHA256_DIGEST_LENGTH; i++) [name appendFormat:@"%02x", digest[i]];
            NSString *directory = [NSSearchPathForDirectoriesInDomains(NSCachesDirectory, NSUserDomainMask, YES).firstObject stringByAppendingPathComponent:@"musicfree-artwork"];
            [[NSFileManager defaultManager] createDirectoryAtPath:directory withIntermediateDirectories:YES attributes:nil error:nil];
            NSString *file = [directory stringByAppendingPathComponent:[name stringByAppendingString:@".jpg"]];
            NSError *error = nil;
            if (![item.dataValue writeToFile:file options:NSDataWritingAtomic error:&error]) { reject(@"ARTWORK_WRITE", error.localizedDescription, error); return; }
            resolve(file); return;
        }
    }
    resolve(@"");
}
RCT_REMAP_METHOD(setMediaTag, setMediaTag:(NSString *)path metadata:(NSDictionary *)metadata resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject) {
    // The fork's edit action stores overrides, and never rewrites users' audio files.
    reject(@"TAG_WRITE_UNAVAILABLE", @"iOS 不改写原始音频标签，请使用歌曲菜单中的“编辑歌曲信息”", nil);
}
@end
