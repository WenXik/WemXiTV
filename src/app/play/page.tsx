/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, no-console, @next/next/no-img-element */

'use client';

import Artplayer from 'artplayer';
import Hls from 'hls.js';
import { Heart } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';

import {
  deleteFavorite,
  deletePlayRecord,
  deleteSkipConfig,
  generateStorageKey,
  getAllPlayRecords,
  getSkipConfig,
  isFavorited,
  saveFavorite,
  savePlayRecord,
  saveSkipConfig,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import { SearchResult } from '@/lib/types';
import { getVideoResolutionFromM3u8, processImageUrl } from '@/lib/utils';

import EpisodeSelector from '@/components/EpisodeSelector';
import PageLayout from '@/components/PageLayout';

// 鎵╁睍 HTMLVideoElement 绫诲瀷浠ユ敮鎸?hls 灞炴€?
declare global {
  interface HTMLVideoElement {
    hls?: any;
  }
}

// Wake Lock API 绫诲瀷澹版槑
interface WakeLockSentinel {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
  removeEventListener(type: 'release', listener: () => void): void;
}

function PlayPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // -----------------------------------------------------------------------------
  // 鐘舵€佸彉閲忥紙State锛?
  // -----------------------------------------------------------------------------
  const [loading, setLoading] = useState(true);
  const [loadingStage, setLoadingStage] = useState<
    'searching' | 'preferring' | 'fetching' | 'ready'
  >('searching');
  const [loadingMessage, setLoadingMessage] = useState('姝ｅ湪鎼滅储鎾斁婧?..');
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<SearchResult | null>(null);

  // 鏀惰棌鐘舵€?
  const [favorited, setFavorited] = useState(false);

  // 璺宠繃鐗囧ご鐗囧熬閰嶇疆
  const [skipConfig, setSkipConfig] = useState<{
    enable: boolean;
    intro_time: number;
    outro_time: number;
  }>({
    enable: false,
    intro_time: 0,
    outro_time: 0,
  });
  const skipConfigRef = useRef(skipConfig);
  useEffect(() => {
    skipConfigRef.current = skipConfig;
  }, [
    skipConfig,
    skipConfig.enable,
    skipConfig.intro_time,
    skipConfig.outro_time,
  ]);

  // 璺宠繃妫€鏌ョ殑鏃堕棿闂撮殧鎺у埗
  const lastSkipCheckRef = useRef(0);

  // 鍘诲箍鍛婂紑鍏筹紙浠?localStorage 缁ф壙锛岄粯璁?true锛?
  const [blockAdEnabled, setBlockAdEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const v = localStorage.getItem('enable_blockad');
      if (v !== null) return v === 'true';
    }
    return true;
  });
  const blockAdEnabledRef = useRef(blockAdEnabled);
  useEffect(() => {
    blockAdEnabledRef.current = blockAdEnabled;
  }, [blockAdEnabled]);

  // 寮哄埗鍏抽棴鐜鍙橀噺锛歵rue 鏃跺己鍒剁鐢ㄥ苟闅愯棌鐩稿叧鎺т欢
  const AI4K_FORCE_DISABLE = process.env.NEXT_PUBLIC_AI_4K_FORCE_DISABLE === 'true';

  // AI澧炲己寮€鍏筹紙浠?localStorage 缁ф壙锛涘鏃犺褰曪紝璇诲彇鐜鍙橀噺 NEXT_PUBLIC_ENABLE_AI_4K锛?
  const [aiEnhanceEnabled, setAiEnhanceEnabled] = useState<boolean>(() => {
    // 鑻ュ己鍒跺叧闂紝鍒欐棤鏉′欢鍏抽棴
    if (AI4K_FORCE_DISABLE) return false;
    if (typeof window !== 'undefined') {
      const v = localStorage.getItem('enable_ai_enhance');
      if (v !== null) return v === 'true';
    }
    // 璇诲彇鐜鍙橀噺浣滀负榛樿鍊硷細true/false锛涙湭璁剧疆鏃堕粯璁ゅ紑鍚?
    const envDefault = process.env.NEXT_PUBLIC_ENABLE_AI_4K;
    if (envDefault === 'true') return true;
    if (envDefault === 'false') return false;
    // 鏈缃幆澧冨彉閲忔椂锛岄粯璁ゅ叧闂?AI4K
    return false;
  });
  const aiEnhanceEnabledRef = useRef(aiEnhanceEnabled);
  useEffect(() => {
    aiEnhanceEnabledRef.current = aiEnhanceEnabled;
  }, [aiEnhanceEnabled]);

  // AI澧炲己绾у埆锛氭爣鍑嗐€侀珮绾с€佹瀬鑷?
  const [aiEnhanceLevel, setAiEnhanceLevel] = useState<'standard' | 'advanced' | 'extreme'>(() => {
    if (typeof window !== 'undefined') {
      const v = localStorage.getItem('ai_enhance_level');
      if (v && ['standard', 'advanced', 'extreme'].includes(v)) return v as any;
    }
    return 'advanced'; // 榛樿楂樼骇
  });
  const aiEnhanceLevelRef = useRef(aiEnhanceLevel);
  useEffect(() => {
    aiEnhanceLevelRef.current = aiEnhanceLevel;
  }, [aiEnhanceLevel]);

  // 鑷姩AI澧炲己绛栫暐锛氬叏灞忔垨瀹藉害瓒呰繃闃堝€兼椂鑷姩寮€鍚?
  const AI_ENHANCE_WIDTH_THRESHOLD = Number(
    (process.env.NEXT_PUBLIC_AI_ENHANCE_WIDTH as any) || 1280
  );
  const [autoAiEnhanceEnabled, _setAutoAiEnhanceEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const v = localStorage.getItem('enable_ai_auto');
      if (v !== null) return v === 'true';
    }
    return true;
  });
  const autoAiEnhanceEnabledRef = useRef(autoAiEnhanceEnabled);
  useEffect(() => {
    autoAiEnhanceEnabledRef.current = autoAiEnhanceEnabled;
  }, [autoAiEnhanceEnabled]);
  const aiEnhancerActiveRef = useRef<boolean>(false);

  const getIsFullscreen = () => {
    if (typeof document === 'undefined') return false;
    return !!document.fullscreenElement;
  };

  const applyAiEnhancePolicy = () => {
    // 鑻ュ己鍒跺叧闂紝鍒欑‘淇濅笉鍚敤澧炲己
    if (AI4K_FORCE_DISABLE) {
      if (aiEnhancerActiveRef.current) {
        try { stopAiEnhancer(); } catch (_) {// ignore
}
        aiEnhancerActiveRef.current = false;
      }
      return;
    }
    const video = artPlayerRef.current?.video as HTMLVideoElement | undefined;
    if (!video) return;
    const shouldEnable =
      autoAiEnhanceEnabledRef.current &&
      (getIsFullscreen() ||
        (typeof window !== 'undefined' &&
          window.innerWidth >= AI_ENHANCE_WIDTH_THRESHOLD));

    // 鎵嬪姩寮€鍚椂寮哄埗淇濇寔寮€鍚?
    if (aiEnhanceEnabledRef.current) {
      if (!aiEnhancerActiveRef.current) {
        startAiEnhancer(video);
        aiEnhancerActiveRef.current = true;
      }
      return;
    }

    // 鍚﹀垯鐢辩瓥鐣ュ喅瀹?
    if (shouldEnable) {
      if (!aiEnhancerActiveRef.current) {
        startAiEnhancer(video);
        aiEnhancerActiveRef.current = true;
      }
    } else {
      if (aiEnhancerActiveRef.current) {
        stopAiEnhancer();
        aiEnhancerActiveRef.current = false;
      }
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => applyAiEnhancePolicy();
    window.addEventListener('resize', handler);
    document.addEventListener('fullscreenchange', handler as any);
    return () => {
      window.removeEventListener('resize', handler);
      document.removeEventListener('fullscreenchange', handler as any);
    };
  }, []);

  // 瑙嗛鍩烘湰淇℃伅
  const [videoTitle, setVideoTitle] = useState(searchParams.get('title') || '');
  const [videoYear, setVideoYear] = useState(searchParams.get('year') || '');
  const [videoCover, setVideoCover] = useState('');
  const [videoDoubanId, setVideoDoubanId] = useState(0);
  // 褰撳墠婧愬拰ID
  const [currentSource, setCurrentSource] = useState(
    searchParams.get('source') || ''
  );
  const [currentId, setCurrentId] = useState(searchParams.get('id') || '');

  // 鎼滅储鎵€闇€淇℃伅
  const [searchTitle] = useState(searchParams.get('stitle') || '');
  const [searchType] = useState(searchParams.get('stype') || '');

  // 鏄惁闇€瑕佷紭閫?
  const [needPrefer, setNeedPrefer] = useState(
    searchParams.get('prefer') === 'true'
  );
  const needPreferRef = useRef(needPrefer);
  useEffect(() => {
    needPreferRef.current = needPrefer;
  }, [needPrefer]);
  // 闆嗘暟鐩稿叧
  const [currentEpisodeIndex, setCurrentEpisodeIndex] = useState(0);

  const currentSourceRef = useRef(currentSource);
  const currentIdRef = useRef(currentId);
  const videoTitleRef = useRef(videoTitle);
  const videoYearRef = useRef(videoYear);
  const detailRef = useRef<SearchResult | null>(detail);
  const currentEpisodeIndexRef = useRef(currentEpisodeIndex);

  // 鍚屾鏈€鏂板€煎埌 refs
  useEffect(() => {
    currentSourceRef.current = currentSource;
    currentIdRef.current = currentId;
    detailRef.current = detail;
    currentEpisodeIndexRef.current = currentEpisodeIndex;
    videoTitleRef.current = videoTitle;
    videoYearRef.current = videoYear;
  }, [
    currentSource,
    currentId,
    detail,
    currentEpisodeIndex,
    videoTitle,
    videoYear,
  ]);

  // 瑙嗛鎾斁鍦板潃
  const [videoUrl, setVideoUrl] = useState('');

  // 鎬婚泦鏁?
  const totalEpisodes = detail?.episodes?.length || 0;

  // 鐢ㄤ簬璁板綍鏄惁闇€瑕佸湪鎾斁鍣?ready 鍚庤烦杞埌鎸囧畾杩涘害
  const resumeTimeRef = useRef<number | null>(null);
  // 涓婃浣跨敤鐨勯煶閲忥紝榛樿 0.7
  const lastVolumeRef = useRef<number>(0.7);
  // 涓婃浣跨敤鐨勬挱鏀鹃€熺巼锛岄粯璁?1.0
  const lastPlaybackRateRef = useRef<number>(1.0);

  // 鎹㈡簮鐩稿叧鐘舵€?
  const [availableSources, setAvailableSources] = useState<SearchResult[]>([]);
  const [sourceSearchLoading, setSourceSearchLoading] = useState(false);
  const [sourceSearchError, setSourceSearchError] = useState<string | null>(
    null
  );

  // 浼橀€夊拰娴嬮€熷紑鍏?
  const [optimizationEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('enableOptimization');
      if (saved !== null) {
        try {
          return JSON.parse(saved);
        } catch {
          /* ignore */
        }
      }
    }
    return true;
  });

  // 淇濆瓨浼橀€夋椂鐨勬祴閫熺粨鏋滐紝閬垮厤EpisodeSelector閲嶅娴嬮€?
  const [precomputedVideoInfo, setPrecomputedVideoInfo] = useState<
    Map<string, { quality: string; loadSpeed: string; pingTime: number }>
  >(new Map());

  // 鎶樺彔鐘舵€侊紙浠呭湪 lg 鍙婁互涓婂睆骞曟湁鏁堬級
  const [isEpisodeSelectorCollapsed, setIsEpisodeSelectorCollapsed] =
    useState(false);

  // 鎹㈡簮鍔犺浇鐘舵€?
  const [isVideoLoading, setIsVideoLoading] = useState(true);
  const [videoLoadingStage, setVideoLoadingStage] = useState<
    'initing' | 'sourceChanging'
  >('initing');

  // 鎾斁杩涘害淇濆瓨鐩稿叧
  const saveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastSaveTimeRef = useRef<number>(0);

  const artPlayerRef = useRef<any>(null);
  const artRef = useRef<HTMLDivElement | null>(null);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const [isEnteringFullscreen, setIsEnteringFullscreen] = useState(false);

  // Wake Lock 鐩稿叧
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // -----------------------------------------------------------------------------
  // 宸ュ叿鍑芥暟锛圲tils锛?
  // -----------------------------------------------------------------------------

  // 鎾斁婧愪紭閫夊嚱鏁?
  const preferBestSource = async (
    sources: SearchResult[]
  ): Promise<SearchResult> => {
    if (sources.length === 1) return sources[0];

    // 灏嗘挱鏀炬簮鍧囧垎涓轰袱鎵癸紝骞跺彂娴嬮€熷悇鎵癸紝閬垮厤涓€娆℃€ц繃澶氳姹?
    const batchSize = Math.ceil(sources.length / 2);
    const allResults: Array<{
      source: SearchResult;
      testResult: { quality: string; loadSpeed: string; pingTime: number };
    } | null> = [];

    for (let start = 0; start < sources.length; start += batchSize) {
      const batchSources = sources.slice(start, start + batchSize);
      const batchResults = await Promise.all(
        batchSources.map(async (source) => {
          try {
            // 妫€鏌ユ槸鍚︽湁绗竴闆嗙殑鎾斁鍦板潃
            if (!source.episodes || source.episodes.length === 0) {
              console.warn(`鎾斁婧?${source.source_name} 娌℃湁鍙敤鐨勬挱鏀惧湴鍧€`);
              return null;
            }

            const episodeUrl =
              source.episodes.length > 1
                ? source.episodes[1]
                : source.episodes[0];
            const testResult = await getVideoResolutionFromM3u8(episodeUrl);

            return {
              source,
              testResult,
            };
          } catch (error) {
            return null;
          }
        })
      );
      allResults.push(...batchResults);
    }

    // 绛夊緟鎵€鏈夋祴閫熷畬鎴愶紝鍖呭惈鎴愬姛鍜屽け璐ョ殑缁撴灉
    // 淇濆瓨鎵€鏈夋祴閫熺粨鏋滃埌 precomputedVideoInfo锛屼緵 EpisodeSelector 浣跨敤锛堝寘鍚敊璇粨鏋滐級
    const newVideoInfoMap = new Map<
      string,
      {
        quality: string;
        loadSpeed: string;
        pingTime: number;
        hasError?: boolean;
      }
    >();
    allResults.forEach((result, index) => {
      const source = sources[index];
      const sourceKey = `${source.source}-${source.id}`;

      if (result) {
        // 鎴愬姛鐨勭粨鏋?
        newVideoInfoMap.set(sourceKey, result.testResult);
      }
    });

    // 杩囨护鍑烘垚鍔熺殑缁撴灉鐢ㄤ簬浼橀€夎绠?
    const successfulResults = allResults.filter(Boolean) as Array<{
      source: SearchResult;
      testResult: { quality: string; loadSpeed: string; pingTime: number };
    }>;

    setPrecomputedVideoInfo(newVideoInfoMap);

    if (successfulResults.length === 0) {
      console.warn('鎵€鏈夋挱鏀炬簮娴嬮€熼兘澶辫触锛屼娇鐢ㄧ涓€涓挱鏀炬簮');
      return sources[0];
    }

    // 鎵惧嚭鎵€鏈夋湁鏁堥€熷害鐨勬渶澶у€硷紝鐢ㄤ簬绾挎€ф槧灏?
    const validSpeeds = successfulResults
      .map((result) => {
        const speedStr = result.testResult.loadSpeed;
        if (speedStr === '鏈煡' || speedStr === '娴嬮噺涓?..') return 0;

        const match = speedStr.match(/^([\d.]+)\s*(KB\/s|MB\/s)$/);
        if (!match) return 0;

        const value = parseFloat(match[1]);
        const unit = match[2];
        return unit === 'MB/s' ? value * 1024 : value; // 缁熶竴杞崲涓?KB/s
      })
      .filter((speed) => speed > 0);

    const maxSpeed = validSpeeds.length > 0 ? Math.max(...validSpeeds) : 1024; // 榛樿1MB/s浣滀负鍩哄噯

    // 鎵惧嚭鎵€鏈夋湁鏁堝欢杩熺殑鏈€灏忓€煎拰鏈€澶у€硷紝鐢ㄤ簬绾挎€ф槧灏?
    const validPings = successfulResults
      .map((result) => result.testResult.pingTime)
      .filter((ping) => ping > 0);

    const minPing = validPings.length > 0 ? Math.min(...validPings) : 50;
    const maxPing = validPings.length > 0 ? Math.max(...validPings) : 1000;

    // 璁＄畻姣忎釜缁撴灉鐨勮瘎鍒?
    const resultsWithScore = successfulResults.map((result) => ({
      ...result,
      score: calculateSourceScore(
        result.testResult,
        maxSpeed,
        minPing,
        maxPing
      ),
    }));

    // 鎸夌患鍚堣瘎鍒嗘帓搴忥紝閫夋嫨鏈€浣虫挱鏀炬簮
    resultsWithScore.sort((a, b) => b.score - a.score);

    console.log('鎾斁婧愯瘎鍒嗘帓搴忕粨鏋?');
    resultsWithScore.forEach((result, index) => {
      console.log(
        `${index + 1}. ${
          result.source.source_name
        } - 璇勫垎: ${result.score.toFixed(2)} (${result.testResult.quality}, ${
          result.testResult.loadSpeed
        }, ${result.testResult.pingTime}ms)`
      );
    });

    return resultsWithScore[0].source;
  };

  // 璁＄畻鎾斁婧愮患鍚堣瘎鍒?
  const calculateSourceScore = (
    testResult: {
      quality: string;
      loadSpeed: string;
      pingTime: number;
    },
    maxSpeed: number,
    minPing: number,
    maxPing: number
  ): number => {
    let score = 0;

    // 鍒嗚鲸鐜囪瘎鍒?(40% 鏉冮噸)
    const qualityScore = (() => {
      switch (testResult.quality) {
        case '4K':
          return 100;
        case '2K':
          return 85;
        case '1080p':
          return 75;
        case '720p':
          return 60;
        case '480p':
          return 40;
        case 'SD':
          return 20;
        default:
          return 0;
      }
    })();
    score += qualityScore * 0.4;

    // 涓嬭浇閫熷害璇勫垎 (40% 鏉冮噸) - 鍩轰簬鏈€澶ч€熷害绾挎€ф槧灏?
    const speedScore = (() => {
      const speedStr = testResult.loadSpeed;
      if (speedStr === '鏈煡' || speedStr === '娴嬮噺涓?..') return 30;

      // 瑙ｆ瀽閫熷害鍊?
      const match = speedStr.match(/^([\d.]+)\s*(KB\/s|MB\/s)$/);
      if (!match) return 30;

      const value = parseFloat(match[1]);
      const unit = match[2];
      const speedKBps = unit === 'MB/s' ? value * 1024 : value;

      // 鍩轰簬鏈€澶ч€熷害绾挎€ф槧灏勶紝鏈€楂?00鍒?
      const speedRatio = speedKBps / maxSpeed;
      return Math.min(100, Math.max(0, speedRatio * 100));
    })();
    score += speedScore * 0.4;

    // 缃戠粶寤惰繜璇勫垎 (20% 鏉冮噸) - 鍩轰簬寤惰繜鑼冨洿绾挎€ф槧灏?
    const pingScore = (() => {
      const ping = testResult.pingTime;
      if (ping <= 0) return 0; // 鏃犳晥寤惰繜缁欓粯璁ゅ垎

      // 濡傛灉鎵€鏈夊欢杩熼兘鐩稿悓锛岀粰婊″垎
      if (maxPing === minPing) return 100;

      // 绾挎€ф槧灏勶細鏈€浣庡欢杩?100鍒嗭紝鏈€楂樺欢杩?0鍒?
      const pingRatio = (maxPing - ping) / (maxPing - minPing);
      return Math.min(100, Math.max(0, pingRatio * 100));
    })();
    score += pingScore * 0.2;

    return Math.round(score * 100) / 100; // 淇濈暀涓や綅灏忔暟
  };

  // 鏇存柊瑙嗛鍦板潃
  const updateVideoUrl = (
    detailData: SearchResult | null,
    episodeIndex: number
  ) => {
    if (
      !detailData ||
      !detailData.episodes ||
      episodeIndex >= detailData.episodes.length
    ) {
      setVideoUrl('');
      return;
    }
    const newUrl = detailData?.episodes[episodeIndex] || '';
    if (newUrl !== videoUrl) {
      setVideoUrl(newUrl);
    }
  };

  const ensureVideoSource = (video: HTMLVideoElement | null, url: string) => {
    if (!video || !url) return;
    const sources = Array.from(video.getElementsByTagName('source'));
    const existed = sources.some((s) => s.src === url);
    if (!existed) {
      // 绉婚櫎鏃х殑 source锛屼繚鎸佸敮涓€
      sources.forEach((s) => s.remove());
      const sourceEl = document.createElement('source');
      sourceEl.src = url;
      video.appendChild(sourceEl);
    }

    // 濮嬬粓鍏佽杩滅▼鎾斁锛圓irPlay / Cast锛?
    video.disableRemotePlayback = false;
    // 濡傛灉鏇剧粡鏈夌鐢ㄥ睘鎬э紝绉婚櫎涔?
    if (video.hasAttribute('disableRemotePlayback')) {
      video.removeAttribute('disableRemotePlayback');
    }
  };

  // Wake Lock 鐩稿叧鍑芥暟
  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request(
          'screen'
        );
        console.log('Wake Lock enabled');
      }
    } catch (err) {
      console.warn('Wake Lock request failed:', err);
    }
  };

  const releaseWakeLock = async () => {
    try {
      if (wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
        console.log('Wake Lock released');
      }
    } catch (err) {
      console.warn('Wake Lock release failed:', err);
    }
  };

  // 娓呯悊鎾斁鍣ㄨ祫婧愮殑缁熶竴鍑芥暟
  const cleanupPlayer = () => {
    // 鍋滄AI澧炲己娓叉煋
    try {
      stopAiEnhancer();
    } catch (_) {
        // ignore
      }

    // 閲婃斁Wake Lock
    try {
      releaseWakeLock();
    } catch (_) {
      // ignore
    }

    if (artPlayerRef.current) {
      try {
        // 淇濆瓨褰撳墠鎾斁杩涘害
        if (artPlayerRef.current.currentTime > 0) {
          resumeTimeRef.current = artPlayerRef.current.currentTime;
        }

        // 绉婚櫎鎵€鏈変簨浠剁洃鍚櫒
        try {
          artPlayerRef.current.off('ready');
          artPlayerRef.current.off('play');
          artPlayerRef.current.off('pause');
          artPlayerRef.current.off('video:ended');
          artPlayerRef.current.off('video:volumechange');
          artPlayerRef.current.off('video:ratechange');
          artPlayerRef.current.off('video:canplay');
          artPlayerRef.current.off('video:timeupdate');
          artPlayerRef.current.off('error');
        } catch (_) {
      // ignore
    }

        // 閿€姣?HLS 瀹炰緥
        if (artPlayerRef.current.video && artPlayerRef.current.video.hls) {
          try {
            artPlayerRef.current.video.hls.destroy();
            artPlayerRef.current.video.hls = null;
          } catch (_) {
      // ignore
    }
        }

        // 閿€姣?ArtPlayer 瀹炰緥
        artPlayerRef.current.destroy();
        artPlayerRef.current = null;

        console.log('鎾斁鍣ㄨ祫婧愬凡娓呯悊');
      } catch (err) {
        console.warn('娓呯悊鎾斁鍣ㄨ祫婧愭椂鍑洪敊:', err);
        artPlayerRef.current = null;
      }
    }

    // 閲嶇疆鎾斁鍣ㄥ垱寤虹姸鎬?
    playerCreatingRef.current = false;
  };

  // AI澧炲己娓叉煋锛氬湪鎾斁鍣ㄥ鍣ㄤ笂鏂瑰彔鍔燙anvas锛屽皢瑙嗛甯ф斁澶у埌4K
  const aiCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const aiAnimRef = useRef<number | null>(null);
  const aiUpdateSizeRef = useRef<(() => void) | null>(null);
  const playerCreatingRef = useRef<boolean>(false);

  const ensureAiCanvas = () => {
    // 鏃犺鏄惁宸叉湁寮曠敤锛岄兘鍏堟竻鐞嗘墍鏈夌幇鏈堿I鐢诲竷
    if (artRef.current) {
      // 娓呯悊鎵€鏈堿I鐢诲竷锛岀‘淇濅笉浼氭湁澶氬眰鍙犲姞
      try {
        Array.from(document.querySelectorAll('canvas[data-ai-enhance="1"]')).forEach((el) => el.remove());
      } catch (_) {
      // ignore
    }
      
      // 纭繚瀹瑰櫒鏄浉瀵瑰畾浣嶏紝鐢诲竷鑳借鐩栧湪椤堕儴
      if (getComputedStyle(artRef.current).position === 'static') {
        artRef.current.style.position = 'relative';
      }
      
      // 鍙湁鍦ㄦ病鏈夊紩鐢ㄦ椂鎵嶅垱寤烘柊鐢诲竷
      if (!aiCanvasRef.current) {
        const c = document.createElement('canvas');
        c.setAttribute('data-ai-enhance', '1');
        c.style.position = 'absolute';
        c.style.left = '0';
        c.style.top = '0';
        c.style.width = '100%';
        c.style.height = '100%';
        c.style.pointerEvents = 'none';
        // 缃簬鎺т欢灞備箣涓嬶紝閬垮厤褰卞搷榧犳爣鏄剧ず涓庝氦浜?
        c.style.zIndex = '30'; // 鎻愰珮z-index纭繚鍦ㄨ棰戜笂鏂逛絾鍦ㄦ帶浠朵笅鏂?
        aiCanvasRef.current = c;
        artRef.current.appendChild(c);
      }
    }
  };

  const startAiEnhancer = (video: HTMLVideoElement) => {
    // 闃叉閲嶅鍚姩锛氬鏋滃凡婵€娲讳笖鐢诲竷瀛樺湪锛屽垯鐩存帴杩斿洖
    if (aiEnhancerActiveRef.current && aiCanvasRef.current) {
      return;
    }
    // 纭繚涓嶅瓨鍦ㄦ棫鐨勬覆鏌撳惊鐜笌鐢诲竷
    try { stopAiEnhancer(); } catch (_) {
      // ignore
    }
    ensureAiCanvas();
    const canvas = aiCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 鎬ц兘鐩戞帶鍙橀噺
    let lastFrameTime = 0;
    let frameCount = 0;
    let tempCanvas: HTMLCanvasElement | null = null;
    let tempCtx: CanvasRenderingContext2D | null = null;
    const TARGET_FPS = 30; // 鐩爣甯х巼
    const FRAME_INTERVAL = 1000 / TARGET_FPS;

    const updateSize = () => {
      const rect = artRef.current?.getBoundingClientRect();
      // 浼樺寲锛氶檺鍒舵渶澶у垎杈ㄧ巼锛岄伩鍏嶈繃搴︽秷鑰楀唴瀛?
      const maxWidth = Math.min(3840, window.innerWidth * 2);
      const maxHeight = Math.min(2160, window.innerHeight * 2);
      const targetW = Math.min(maxWidth, Math.round(rect?.width || video.videoWidth || 1920));
      const targetH = Math.min(maxHeight, Math.round(rect?.height || video.videoHeight || 1080));
      
      canvas.width = targetW;
      canvas.height = targetH;
      
      // 閲嶆柊鍒涘缓涓存椂鐢诲竷浠ュ尮閰嶈棰戝昂瀵?
      if (tempCanvas) {
        tempCanvas.width = video.videoWidth || 1920;
        tempCanvas.height = video.videoHeight || 1080;
      }
    };

    // 璁板綍骞跺垵濮嬭皟鏁村昂瀵?
    aiUpdateSizeRef.current = updateSize;
    updateSize();

    const draw = (currentTime: number = performance.now()) => {
      if (!artPlayerRef.current) return;
      
      // 甯х巼鎺у埗锛氶檺鍒舵覆鏌撻鐜?
      if (currentTime - lastFrameTime < FRAME_INTERVAL) {
        aiAnimRef.current = requestAnimationFrame(draw);
        return;
      }
      lastFrameTime = currentTime;
      frameCount++;

      const allow =
        aiEnhanceEnabledRef.current ||
        (autoAiEnhanceEnabledRef.current &&
          (getIsFullscreen() ||
            (typeof window !== 'undefined' &&
              window.innerWidth >= AI_ENHANCE_WIDTH_THRESHOLD)));
      if (!allow) {
        if (aiAnimRef.current !== null) cancelAnimationFrame(aiAnimRef.current);
        aiAnimRef.current = null;
        return;
      }
      
      try {
        // 澶嶇敤涓存椂鐢诲竷锛岄伩鍏嶉绻佸垱寤洪攢姣?
        if (!tempCanvas) {
          tempCanvas = document.createElement('canvas');
          tempCanvas.width = video.videoWidth || 1920;
          tempCanvas.height = video.videoHeight || 1080;
          tempCtx = tempCanvas.getContext('2d');
        }
        if (!tempCtx) return;
        
        // 娓呯┖鐢诲竷骞剁粯鍒跺綋鍓嶈棰戝抚
        tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
        tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
        
        // 鑾峰彇鍥惧儚鏁版嵁杩涜AI澧炲己澶勭悊
        const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        const data = imageData.data;
        
        // AI鐢昏川澧炲己绠楁硶 - 鏍规嵁绾у埆璋冩暣鍙傛暟
        const level = aiEnhanceLevelRef.current;
        let sharpening, contrast, saturation, warmR_factor, warmG_factor, warmB_factor;
        
        switch (level) {
          case 'standard':
            sharpening = 1.2;
            contrast = 1.1;
            saturation = 1.1;
            warmR_factor = 1.02;
            warmG_factor = 1.01;
            warmB_factor = 0.99;
            break;
          case 'advanced':
            sharpening = 1.6;
            contrast = 1.3;
            saturation = 1.25;
            warmR_factor = 1.04;
            warmG_factor = 1.02;
            warmB_factor = 0.98;
            break;
          case 'extreme':
            sharpening = 2.2;
            contrast = 1.6;
            saturation = 1.5;
            warmR_factor = 1.08;
            warmG_factor = 1.04;
            warmB_factor = 0.96;
            break;
          default:
            sharpening = 1.6;
            contrast = 1.3;
            saturation = 1.25;
            warmR_factor = 1.04;
            warmG_factor = 1.02;
            warmB_factor = 0.98;
        }

        // 鎬ц兘浼樺寲锛氭壒閲忓鐞嗗儚绱狅紝鍑忓皯鍑芥暟璋冪敤寮€閿€
        const dataLength = data.length;
        for (let i = 0; i < dataLength; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          
          // 浼樺寲锛氬悎骞惰绠楁楠わ紝鍑忓皯涓棿鍙橀噺
          // 閿愬寲 + 瀵规瘮搴﹀寮?
          const enhancedR = ((r * sharpening / 255 - 0.5) * contrast + 0.5) * 255;
          const enhancedG = ((g * sharpening / 255 - 0.5) * contrast + 0.5) * 255;
          const enhancedB = ((b * sharpening / 255 - 0.5) * contrast + 0.5) * 255;
          
          // 楗卞拰搴﹀寮?
          const gray = 0.299 * enhancedR + 0.587 * enhancedG + 0.114 * enhancedB;
          const satR = gray + saturation * (enhancedR - gray);
          const satG = gray + saturation * (enhancedG - gray);
          const satB = gray + saturation * (enhancedB - gray);
          
          // 鑹插僵鏍℃ + 杈圭晫妫€鏌?
          data[i] = Math.min(255, Math.max(0, satR * warmR_factor));
          data[i + 1] = Math.min(255, Math.max(0, satG * warmG_factor));
          data[i + 2] = Math.min(255, Math.max(0, satB * warmB_factor));
        }
        
        // 灏嗗寮哄悗鐨勫浘鍍忔暟鎹粯鍒跺洖涓存椂鐢诲竷
        tempCtx.putImageData(imageData, 0, 0);
        
        // 浣跨敤楂樿川閲忔彃鍊煎皢澧炲己鍚庣殑鍥惧儚鏀惧ぇ鍒扮洰鏍囩敾甯?
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
      } catch (_) {
      // ignore
    }

      if ((video as any).requestVideoFrameCallback) {
        (video as any).requestVideoFrameCallback(() => {
          aiAnimRef.current = requestAnimationFrame(draw);
        });
      } else {
        aiAnimRef.current = requestAnimationFrame(draw);
      }
    };

    aiAnimRef.current = requestAnimationFrame(draw);
    aiEnhancerActiveRef.current = true;

    // 璺熼殢鎾斁鍣ㄥ昂瀵稿彉鍖栬€岃皟鏁存覆鏌撶洰鏍囷紙閬垮厤閲嶅缁戝畾锛?
    if (artPlayerRef.current && aiUpdateSizeRef.current) {
      try { artPlayerRef.current.off('resize', aiUpdateSizeRef.current); } catch (_) {
      // ignore
    }
      artPlayerRef.current.on('resize', aiUpdateSizeRef.current);
    }
  };

  const stopAiEnhancer = () => {
    // 鍙栨秷鍔ㄧ敾甯?
    if (aiAnimRef.current !== null) {
      cancelAnimationFrame(aiAnimRef.current);
      aiAnimRef.current = null;
    }
    
    // 瑙ｇ粦resize鐩戝惉
    if (artPlayerRef.current && aiUpdateSizeRef.current) {
      try { 
        artPlayerRef.current.off('resize', aiUpdateSizeRef.current); 
      } catch (_) {
      // ignore
    }
      aiUpdateSizeRef.current = null;
    }
    
    // 娓呯悊涓荤敾甯?
    if (aiCanvasRef.current) {
      try {
        // 娓呯┖鐢诲竷鍐呭閲婃斁鍐呭瓨
        const ctx = aiCanvasRef.current.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, aiCanvasRef.current.width, aiCanvasRef.current.height);
        }
        aiCanvasRef.current.remove();
        aiCanvasRef.current = null;
      } catch (_) {
      // ignore
    }
    }
    
    // 棰濆娓呯悊鍙兘娈嬬暀鐨勬墍鏈堿I鐢诲竷
    try {
      Array.from(document.querySelectorAll('canvas[data-ai-enhance="1"]')).forEach((el) => {
        try {
          const ctx = (el as HTMLCanvasElement).getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, (el as HTMLCanvasElement).width, (el as HTMLCanvasElement).height);
          }
          el.remove();
        } catch (_) {
      // ignore
    }
      });
    } catch (_) {
      // ignore
    }
    
    // 寮哄埗鍨冨溇鍥炴敹鎻愮ず锛堝湪鏀寔鐨勬祻瑙堝櫒涓級
    if (typeof window !== 'undefined' && (window as any).gc) {
      try {
        (window as any).gc();
      } catch (_) {
      // ignore
    }
    }
    
    aiEnhancerActiveRef.current = false;
  };

  // 鍘诲箍鍛婄浉鍏冲嚱鏁?
  function filterAdsFromM3U8(m3u8Content: string): string {
    if (!m3u8Content) return '';

    // 鎸夎鍒嗗壊M3U8鍐呭
    const lines = m3u8Content.split('\n');
    const filteredLines = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 鍙繃婊?EXT-X-DISCONTINUITY鏍囪瘑
      if (!line.includes('#EXT-X-DISCONTINUITY')) {
        filteredLines.push(line);
      }
    }

    return filteredLines.join('\n');
  }

  // 璺宠繃鐗囧ご鐗囧熬閰嶇疆鐩稿叧鍑芥暟
  const handleSkipConfigChange = async (newConfig: {
    enable: boolean;
    intro_time: number;
    outro_time: number;
  }) => {
    if (!currentSourceRef.current || !currentIdRef.current) return;

    try {
      setSkipConfig(newConfig);
      if (!newConfig.enable && !newConfig.intro_time && !newConfig.outro_time) {
        await deleteSkipConfig(currentSourceRef.current, currentIdRef.current);
        artPlayerRef.current.setting.update({
          name: '璺宠繃鐗囧ご鐗囧熬',
          html: '璺宠繃鐗囧ご鐗囧熬',
          switch: skipConfigRef.current.enable,
          onSwitch: function (item: any) {
            const newConfig = {
              ...skipConfigRef.current,
              enable: !item.switch,
            };
            handleSkipConfigChange(newConfig);
            return !item.switch;
          },
        });
        artPlayerRef.current.setting.update({
          name: '璁剧疆鐗囧ご',
          html: '璁剧疆鐗囧ご',
          icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="12" r="2" fill="#ffffff"/><path d="M9 12L17 12" stroke="#ffffff" stroke-width="2"/><path d="M17 6L17 18" stroke="#ffffff" stroke-width="2"/></svg>',
          tooltip:
            skipConfigRef.current.intro_time === 0
              ? '璁剧疆鐗囧ご鏃堕棿'
              : `${formatTime(skipConfigRef.current.intro_time)}`,
          onClick: function () {
            const currentTime = artPlayerRef.current?.currentTime || 0;
            if (currentTime > 0) {
              const newConfig = {
                ...skipConfigRef.current,
                intro_time: currentTime,
              };
              handleSkipConfigChange(newConfig);
              return `${formatTime(currentTime)}`;
            }
          },
        });
        artPlayerRef.current.setting.update({
          name: '璁剧疆鐗囧熬',
          html: '璁剧疆鐗囧熬',
          icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 6L7 18" stroke="#ffffff" stroke-width="2"/><path d="M7 12L15 12" stroke="#ffffff" stroke-width="2"/><circle cx="19" cy="12" r="2" fill="#ffffff"/></svg>',
          tooltip:
            skipConfigRef.current.outro_time >= 0
              ? '璁剧疆鐗囧熬鏃堕棿'
              : `-${formatTime(-skipConfigRef.current.outro_time)}`,
          onClick: function () {
            const outroTime =
              -(
                artPlayerRef.current?.duration -
                artPlayerRef.current?.currentTime
              ) || 0;
            if (outroTime < 0) {
              const newConfig = {
                ...skipConfigRef.current,
                outro_time: outroTime,
              };
              handleSkipConfigChange(newConfig);
              return `-${formatTime(-outroTime)}`;
            }
          },
        });
      } else {
        await saveSkipConfig(
          currentSourceRef.current,
          currentIdRef.current,
          newConfig
        );
      }
      console.log('璺宠繃鐗囧ご鐗囧熬閰嶇疆宸蹭繚瀛?', newConfig);
    } catch (err) {
      console.error('淇濆瓨璺宠繃鐗囧ご鐗囧熬閰嶇疆澶辫触:', err);
    }
  };

  const formatTime = (seconds: number): string => {
    if (seconds === 0) return '00:00';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.round(seconds % 60);

    if (hours === 0) {
      // 涓嶅埌涓€灏忔椂锛屾牸寮忎负 00:00
      return `${minutes.toString().padStart(2, '0')}:${remainingSeconds
        .toString()
        .padStart(2, '0')}`;
    } else {
      // 瓒呰繃涓€灏忔椂锛屾牸寮忎负 00:00:00
      return `${hours.toString().padStart(2, '0')}:${minutes
        .toString()
        .padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
  };

  class CustomHlsJsLoader extends Hls.DefaultConfig.loader {
    constructor(config: any) {
      super(config);
      const load = this.load.bind(this);
      this.load = function (context: any, config: any, callbacks: any) {
        // 鎷︽埅manifest鍜宭evel璇锋眰
        if (
          (context as any).type === 'manifest' ||
          (context as any).type === 'level'
        ) {
          const onSuccess = callbacks.onSuccess;
          callbacks.onSuccess = function (
            response: any,
            stats: any,
            context: any
          ) {
            // 濡傛灉鏄痬3u8鏂囦欢锛屽鐞嗗唴瀹逛互绉婚櫎骞垮憡鍒嗘
            if (response.data && typeof response.data === 'string') {
              // 杩囨护鎺夊箍鍛婃 - 瀹炵幇鏇寸簿纭殑骞垮憡杩囨护閫昏緫
              response.data = filterAdsFromM3U8(response.data);
            }
            return onSuccess(response, stats, context, null);
          };
        }
        // 鎵ц鍘熷load鏂规硶
        load(context, config, callbacks);
      };
    }
  }

  // 褰撻泦鏁扮储寮曞彉鍖栨椂鑷姩鏇存柊瑙嗛鍦板潃
  useEffect(() => {
    updateVideoUrl(detail, currentEpisodeIndex);
  }, [detail, currentEpisodeIndex]);

  // 杩涘叆椤甸潰鏃剁洿鎺ヨ幏鍙栧叏閮ㄦ簮淇℃伅
  useEffect(() => {
    const fetchSourceDetail = async (
      source: string,
      id: string
    ): Promise<SearchResult[]> => {
      try {
        const detailResponse = await fetch(
          `/api/detail?source=${source}&id=${id}`
        );
        if (!detailResponse.ok) {
          throw new Error('鑾峰彇瑙嗛璇︽儏澶辫触');
        }
        const detailData = (await detailResponse.json()) as SearchResult;
        setAvailableSources([detailData]);
        return [detailData];
      } catch (err) {
        console.error('鑾峰彇瑙嗛璇︽儏澶辫触:', err);
        return [];
      } finally {
        setSourceSearchLoading(false);
      }
    };
    const fetchSourcesData = async (query: string): Promise<SearchResult[]> => {
      // 鏍规嵁鎼滅储璇嶈幏鍙栧叏閮ㄦ簮淇℃伅
      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(query.trim())}`
        );
        if (!response.ok) {
          throw new Error('鎼滅储澶辫触');
        }
        const data = await response.json();

        // 澶勭悊鎼滅储缁撴灉锛屾牴鎹鍒欒繃婊?
        const results = data.results.filter(
          (result: SearchResult) =>
            result.title.replaceAll(' ', '').toLowerCase() ===
              videoTitleRef.current.replaceAll(' ', '').toLowerCase() &&
            (videoYearRef.current
              ? result.year.toLowerCase() === videoYearRef.current.toLowerCase()
              : true) &&
            (searchType
              ? (searchType === 'tv' && result.episodes.length > 1) ||
                (searchType === 'movie' && result.episodes.length === 1)
              : true)
        );
        setAvailableSources(results);
        return results;
      } catch (err) {
        setSourceSearchError(err instanceof Error ? err.message : '鎼滅储澶辫触');
        setAvailableSources([]);
        return [];
      } finally {
        setSourceSearchLoading(false);
      }
    };

    const initAll = async () => {
      if (!currentSource && !currentId && !videoTitle && !searchTitle) {
        setError('缂哄皯蹇呰鍙傛暟');
        setLoading(false);
        return;
      }
      setLoading(true);
      setLoadingStage(currentSource && currentId ? 'fetching' : 'searching');
      setLoadingMessage(
        currentSource && currentId
          ? '馃幀 姝ｅ湪鑾峰彇瑙嗛璇︽儏...'
          : '馃攳 姝ｅ湪鎼滅储鎾斁婧?..'
      );

      let sourcesInfo = await fetchSourcesData(searchTitle || videoTitle);
      if (
        currentSource &&
        currentId &&
        !sourcesInfo.some(
          (source) => source.source === currentSource && source.id === currentId
        )
      ) {
        sourcesInfo = await fetchSourceDetail(currentSource, currentId);
      }
      if (sourcesInfo.length === 0) {
        setError('鏈壘鍒板尮閰嶇粨鏋?);
        setLoading(false);
        return;
      }

      let detailData: SearchResult = sourcesInfo[0];
      // 鎸囧畾婧愬拰id涓旀棤闇€浼橀€?
      if (currentSource && currentId && !needPreferRef.current) {
        const target = sourcesInfo.find(
          (source) => source.source === currentSource && source.id === currentId
        );
        if (target) {
          detailData = target;
        } else {
          setError('鏈壘鍒板尮閰嶇粨鏋?);
          setLoading(false);
          return;
        }
      }

      // 鏈寚瀹氭簮鍜?id 鎴栭渶瑕佷紭閫夛紝涓斿紑鍚紭閫夊紑鍏?
      if (
        (!currentSource || !currentId || needPreferRef.current) &&
        optimizationEnabled
      ) {
        setLoadingStage('preferring');
        setLoadingMessage('鈿?姝ｅ湪浼橀€夋渶浣虫挱鏀炬簮...');

        detailData = await preferBestSource(sourcesInfo);
      }

      console.log(detailData.source, detailData.id);

      setNeedPrefer(false);
      setCurrentSource(detailData.source);
      setCurrentId(detailData.id);
      setVideoYear(detailData.year);
      setVideoTitle(detailData.title || videoTitleRef.current);
      setVideoCover(detailData.poster);
      setVideoDoubanId(detailData.douban_id || 0);
      setDetail(detailData);
      if (currentEpisodeIndex >= detailData.episodes.length) {
        setCurrentEpisodeIndex(0);
      }

      // 瑙勮寖URL鍙傛暟
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('source', detailData.source);
      newUrl.searchParams.set('id', detailData.id);
      newUrl.searchParams.set('year', detailData.year);
      newUrl.searchParams.set('title', detailData.title);
      newUrl.searchParams.delete('prefer');
      window.history.replaceState({}, '', newUrl.toString());

      setLoadingStage('ready');
      setLoadingMessage('鉁?鍑嗗灏辩华锛屽嵆灏嗗紑濮嬫挱鏀?..');

      // 鐭殏寤惰繜璁╃敤鎴风湅鍒板畬鎴愮姸鎬?
      setTimeout(() => {
        setLoading(false);
      }, 1000);
    };

    initAll();
  }, []);

  // 鎾斁璁板綍澶勭悊
  useEffect(() => {
    // 浠呭湪鍒濇鎸傝浇鏃舵鏌ユ挱鏀捐褰?
    const initFromHistory = async () => {
      if (!currentSource || !currentId) return;

      try {
        const allRecords = await getAllPlayRecords();
        const key = generateStorageKey(currentSource, currentId);
        const record = allRecords[key];

        if (record) {
          const targetIndex = record.index - 1;
          const targetTime = record.play_time;

          // 鏇存柊褰撳墠閫夐泦绱㈠紩
          if (targetIndex !== currentEpisodeIndex) {
            setCurrentEpisodeIndex(targetIndex);
          }

          // 淇濆瓨寰呮仮澶嶇殑鎾斁杩涘害锛屽緟鎾斁鍣ㄥ氨缁悗璺宠浆
          resumeTimeRef.current = targetTime;
        }
      } catch (err) {
        console.error('璇诲彇鎾斁璁板綍澶辫触:', err);
      }
    };

    initFromHistory();
  }, []);

  // 璺宠繃鐗囧ご鐗囧熬閰嶇疆澶勭悊
  useEffect(() => {
    // 浠呭湪鍒濇鎸傝浇鏃舵鏌ヨ烦杩囩墖澶寸墖灏鹃厤缃?
    const initSkipConfig = async () => {
      if (!currentSource || !currentId) return;

      try {
        const config = await getSkipConfig(currentSource, currentId);
        if (config) {
          setSkipConfig(config);
        }
      } catch (err) {
        console.error('璇诲彇璺宠繃鐗囧ご鐗囧熬閰嶇疆澶辫触:', err);
      }
    };

    initSkipConfig();
  }, []);

  // 澶勭悊鎹㈡簮
  const handleSourceChange = async (
    newSource: string,
    newId: string,
    newTitle: string
  ) => {
    try {
      // 鏄剧ず鎹㈡簮鍔犺浇鐘舵€?
      setVideoLoadingStage('sourceChanging');
      setIsVideoLoading(true);

      // 璁板綍褰撳墠鎾斁杩涘害锛堜粎鍦ㄥ悓涓€闆嗘暟鍒囨崲鏃舵仮澶嶏級
      const currentPlayTime = artPlayerRef.current?.currentTime || 0;
      console.log('鎹㈡簮鍓嶅綋鍓嶆挱鏀炬椂闂?', currentPlayTime);

      // 娓呴櫎鍓嶄竴涓巻鍙茶褰?
      if (currentSourceRef.current && currentIdRef.current) {
        try {
          await deletePlayRecord(
            currentSourceRef.current,
            currentIdRef.current
          );
          console.log('宸叉竻闄ゅ墠涓€涓挱鏀捐褰?);
        } catch (err) {
          console.error('娓呴櫎鎾斁璁板綍澶辫触:', err);
        }
      }

      // 娓呴櫎骞惰缃笅涓€涓烦杩囩墖澶寸墖灏鹃厤缃?
      if (currentSourceRef.current && currentIdRef.current) {
        try {
          await deleteSkipConfig(
            currentSourceRef.current,
            currentIdRef.current
          );
          await saveSkipConfig(newSource, newId, skipConfigRef.current);
        } catch (err) {
          console.error('娓呴櫎璺宠繃鐗囧ご鐗囧熬閰嶇疆澶辫触:', err);
        }
      }

      const newDetail = availableSources.find(
        (source) => source.source === newSource && source.id === newId
      );
      if (!newDetail) {
        setError('鏈壘鍒板尮閰嶇粨鏋?);
        return;
      }

      // 灏濊瘯璺宠浆鍒板綋鍓嶆鍦ㄦ挱鏀剧殑闆嗘暟
      let targetIndex = currentEpisodeIndex;

      // 濡傛灉褰撳墠闆嗘暟瓒呭嚭鏂版簮鐨勮寖鍥达紝鍒欒烦杞埌绗竴闆?
      if (!newDetail.episodes || targetIndex >= newDetail.episodes.length) {
        targetIndex = 0;
      }

      // 濡傛灉浠嶇劧鏄悓涓€闆嗘暟涓旀挱鏀捐繘搴︽湁鏁堬紝鍒欏湪鎾斁鍣ㄥ氨缁悗鎭㈠鍒板師濮嬭繘搴?
      if (targetIndex !== currentEpisodeIndex) {
        resumeTimeRef.current = 0;
      } else if (
        (!resumeTimeRef.current || resumeTimeRef.current === 0) &&
        currentPlayTime > 1
      ) {
        resumeTimeRef.current = currentPlayTime;
      }

      // 鏇存柊URL鍙傛暟锛堜笉鍒锋柊椤甸潰锛?
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('source', newSource);
      newUrl.searchParams.set('id', newId);
      newUrl.searchParams.set('year', newDetail.year);
      window.history.replaceState({}, '', newUrl.toString());

      setVideoTitle(newDetail.title || newTitle);
      setVideoYear(newDetail.year);
      setVideoCover(newDetail.poster);
      setVideoDoubanId(newDetail.douban_id || 0);
      setCurrentSource(newSource);
      setCurrentId(newId);
      setDetail(newDetail);
      setCurrentEpisodeIndex(targetIndex);
    } catch (err) {
      // 闅愯棌鎹㈡簮鍔犺浇鐘舵€?
      setIsVideoLoading(false);
      setError(err instanceof Error ? err.message : '鎹㈡簮澶辫触');
    }
  };

  useEffect(() => {
    document.addEventListener('keydown', handleKeyboardShortcuts);
    return () => {
      document.removeEventListener('keydown', handleKeyboardShortcuts);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // 闆嗘暟鍒囨崲
  // ---------------------------------------------------------------------------
  // 澶勭悊闆嗘暟鍒囨崲
  const handleEpisodeChange = (episodeNumber: number) => {
    if (episodeNumber >= 0 && episodeNumber < totalEpisodes) {
      // 鍦ㄦ洿鎹㈤泦鏁板墠淇濆瓨褰撳墠鎾斁杩涘害
      if (artPlayerRef.current && artPlayerRef.current.paused) {
        saveCurrentPlayProgress();
      }
      setCurrentEpisodeIndex(episodeNumber);
    }
  };

  const handlePreviousEpisode = () => {
    const d = detailRef.current;
    const idx = currentEpisodeIndexRef.current;
    if (d && d.episodes && idx > 0) {
      if (artPlayerRef.current && !artPlayerRef.current.paused) {
        saveCurrentPlayProgress();
      }
      setCurrentEpisodeIndex(idx - 1);
    }
  };

  const handleNextEpisode = () => {
    const d = detailRef.current;
    const idx = currentEpisodeIndexRef.current;
    if (d && d.episodes && idx < d.episodes.length - 1) {
      if (artPlayerRef.current && !artPlayerRef.current.paused) {
        saveCurrentPlayProgress();
      }
      setCurrentEpisodeIndex(idx + 1);
    }
  };

  // ---------------------------------------------------------------------------
  // 閿洏蹇嵎閿?
  // ---------------------------------------------------------------------------
  // 澶勭悊鍏ㄥ眬蹇嵎閿?
  const handleKeyboardShortcuts = (e: KeyboardEvent) => {
    // 蹇界暐杈撳叆妗嗕腑鐨勬寜閿簨浠?
    if (
      (e.target as HTMLElement).tagName === 'INPUT' ||
      (e.target as HTMLElement).tagName === 'TEXTAREA'
    )
      return;

    // Alt + 宸︾澶?= 涓婁竴闆?
    if (e.altKey && e.key === 'ArrowLeft') {
      if (detailRef.current && currentEpisodeIndexRef.current > 0) {
        handlePreviousEpisode();
        e.preventDefault();
      }
    }

    // Alt + 鍙崇澶?= 涓嬩竴闆?
    if (e.altKey && e.key === 'ArrowRight') {
      const d = detailRef.current;
      const idx = currentEpisodeIndexRef.current;
      if (d && idx < d.episodes.length - 1) {
        handleNextEpisode();
        e.preventDefault();
      }
    }

    // 宸︾澶?= 蹇€€
    if (!e.altKey && e.key === 'ArrowLeft') {
      if (artPlayerRef.current && artPlayerRef.current.currentTime > 5) {
        artPlayerRef.current.currentTime -= 10;
        e.preventDefault();
      }
    }

    // 鍙崇澶?= 蹇繘
    if (!e.altKey && e.key === 'ArrowRight') {
      if (
        artPlayerRef.current &&
        artPlayerRef.current.currentTime < artPlayerRef.current.duration - 5
      ) {
        artPlayerRef.current.currentTime += 10;
        e.preventDefault();
      }
    }

    // 涓婄澶?= 闊抽噺+
    if (e.key === 'ArrowUp') {
      if (artPlayerRef.current && artPlayerRef.current.volume < 1) {
        artPlayerRef.current.volume =
          Math.round((artPlayerRef.current.volume + 0.1) * 10) / 10;
        artPlayerRef.current.notice.show = `闊抽噺: ${Math.round(
          artPlayerRef.current.volume * 100
        )}`;
        e.preventDefault();
      }
    }

    // 涓嬬澶?= 闊抽噺-
    if (e.key === 'ArrowDown') {
      if (artPlayerRef.current && artPlayerRef.current.volume > 0) {
        artPlayerRef.current.volume =
          Math.round((artPlayerRef.current.volume - 0.1) * 10) / 10;
        artPlayerRef.current.notice.show = `闊抽噺: ${Math.round(
          artPlayerRef.current.volume * 100
        )}`;
        e.preventDefault();
      }
    }

    // 绌烘牸 = 鎾斁/鏆傚仠
    if (e.key === ' ') {
      if (artPlayerRef.current) {
        artPlayerRef.current.toggle();
        e.preventDefault();
      }
    }

    // f 閿?= 鍒囨崲鍏ㄥ睆锛堣繘鍏ュ墠鎾斁杩囨浮鍔ㄧ敾锛?
    if (e.key === 'f' || e.key === 'F') {
      const art = artPlayerRef.current;
      if (art) {
        e.preventDefault();
        if (!art.fullscreen) {
          setIsEnteringFullscreen(true);
          setTimeout(() => {
            try {
              art.fullscreen = true;
            } finally {
              setIsEnteringFullscreen(false);
            }
          }, 400);
        } else {
          art.fullscreen = false;
        }
      }
    }
  };

  // ---------------------------------------------------------------------------
  // 鎾斁璁板綍鐩稿叧
  // ---------------------------------------------------------------------------
  // 淇濆瓨鎾斁杩涘害
  const saveCurrentPlayProgress = async () => {
    if (
      !artPlayerRef.current ||
      !currentSourceRef.current ||
      !currentIdRef.current ||
      !videoTitleRef.current ||
      !detailRef.current?.source_name
    ) {
      return;
    }

    const player = artPlayerRef.current;
    const currentTime = player.currentTime || 0;
    const duration = player.duration || 0;

    // 濡傛灉鎾斁鏃堕棿澶煭锛堝皯浜?绉掞級鎴栬€呰棰戞椂闀挎棤鏁堬紝涓嶄繚瀛?
    if (currentTime < 1 || !duration) {
      return;
    }

    try {
      await savePlayRecord(currentSourceRef.current, currentIdRef.current, {
        title: videoTitleRef.current,
        source_name: detailRef.current?.source_name || '',
        year: detailRef.current?.year,
        cover: detailRef.current?.poster || '',
        index: currentEpisodeIndexRef.current + 1, // 杞崲涓?鍩虹储寮?
        total_episodes: detailRef.current?.episodes.length || 1,
        play_time: Math.floor(currentTime),
        total_time: Math.floor(duration),
        save_time: Date.now(),
        search_title: searchTitle,
      });

      lastSaveTimeRef.current = Date.now();
      console.log('鎾斁杩涘害宸蹭繚瀛?', {
        title: videoTitleRef.current,
        episode: currentEpisodeIndexRef.current + 1,
        year: detailRef.current?.year,
        progress: `${Math.floor(currentTime)}/${Math.floor(duration)}`,
      });
    } catch (err) {
      console.error('淇濆瓨鎾斁杩涘害澶辫触:', err);
    }
  };

  const throttleSaveProgress = () => {
    const now = Date.now();
    let interval = 5000;
    if (process.env.NEXT_PUBLIC_STORAGE_TYPE === 'd1') {
      interval = 10000;
    }
    if (process.env.NEXT_PUBLIC_STORAGE_TYPE === 'upstash') {
      interval = 20000;
    }
    if (now - lastSaveTimeRef.current > interval) {
      saveCurrentPlayProgress();
      lastSaveTimeRef.current = now;
    }
  };

  useEffect(() => {
    // 椤甸潰鍗冲皢鍗歌浇鏃朵繚瀛樻挱鏀捐繘搴﹀拰娓呯悊璧勬簮
    const handleBeforeUnload = () => {
      saveCurrentPlayProgress();
      releaseWakeLock();
      cleanupPlayer();
    };

    // 椤甸潰鍙鎬у彉鍖栨椂淇濆瓨鎾斁杩涘害鍜岄噴鏀?Wake Lock
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveCurrentPlayProgress();
        releaseWakeLock();
      } else if (document.visibilityState === 'visible') {
        // 椤甸潰閲嶆柊鍙鏃讹紝濡傛灉姝ｅ湪鎾斁鍒欓噸鏂拌姹?Wake Lock
        if (artPlayerRef.current && !artPlayerRef.current.paused) {
          requestWakeLock();
        }
      }
    };

    // 娣诲姞浜嬩欢鐩戝惉鍣?
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      // 娓呯悊浜嬩欢鐩戝惉鍣?
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentEpisodeIndex, detail, artPlayerRef.current]);

  // 娓呯悊瀹氭椂鍣?
  useEffect(() => {
    return () => {
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
      }
    };
  }, []);

  // ---------------------------------------------------------------------------
  // 鏀惰棌鐩稿叧
  // ---------------------------------------------------------------------------
  // 姣忓綋 source 鎴?id 鍙樺寲鏃舵鏌ユ敹钘忕姸鎬?
  useEffect(() => {
    if (!currentSource || !currentId) return;
    (async () => {
      try {
        const fav = await isFavorited(currentSource, currentId);
        setFavorited(fav);
      } catch (err) {
        console.error('妫€鏌ユ敹钘忕姸鎬佸け璐?', err);
      }
    })();
  }, [currentSource, currentId]);

  // 鐩戝惉鏀惰棌鏁版嵁鏇存柊浜嬩欢
  useEffect(() => {
    if (!currentSource || !currentId) return;

    const unsubscribe = subscribeToDataUpdates(
      'favoritesUpdated',
      (favorites: Record<string, any>) => {
        const key = generateStorageKey(currentSource, currentId);
        const isFav = !!favorites[key];
        setFavorited(isFav);
      }
    );

    return unsubscribe;
  }, [currentSource, currentId]);

  // 鍒囨崲鏀惰棌
  const handleToggleFavorite = async () => {
    if (
      !videoTitleRef.current ||
      !detailRef.current ||
      !currentSourceRef.current ||
      !currentIdRef.current
    )
      return;

    try {
      if (favorited) {
        // 濡傛灉宸叉敹钘忥紝鍒犻櫎鏀惰棌
        await deleteFavorite(currentSourceRef.current, currentIdRef.current);
        setFavorited(false);
      } else {
        // 濡傛灉鏈敹钘忥紝娣诲姞鏀惰棌
        await saveFavorite(currentSourceRef.current, currentIdRef.current, {
          title: videoTitleRef.current,
          source_name: detailRef.current?.source_name || '',
          year: detailRef.current?.year,
          cover: detailRef.current?.poster || '',
          total_episodes: detailRef.current?.episodes.length || 1,
          save_time: Date.now(),
          search_title: searchTitle,
        });
        setFavorited(true);
      }
    } catch (err) {
      console.error('鍒囨崲鏀惰棌澶辫触:', err);
    }
  };

  useEffect(() => {
    if (
      !Artplayer ||
      !Hls ||
      !videoUrl ||
      loading ||
      currentEpisodeIndex === null ||
      !artRef.current
    ) {
      return;
    }

    // 纭繚閫夐泦绱㈠紩鏈夋晥
    if (
      !detail ||
      !detail.episodes ||
      currentEpisodeIndex >= detail.episodes.length ||
      currentEpisodeIndex < 0
    ) {
      setError(`閫夐泦绱㈠紩鏃犳晥锛屽綋鍓嶅叡 ${totalEpisodes} 闆哷);
      return;
    }

    if (!videoUrl) {
      setError('瑙嗛鍦板潃鏃犳晥');
      return;
    }
    console.log(videoUrl);

    // 妫€娴嬫槸鍚︿负WebKit娴忚鍣?
    const isWebkit =
      typeof window !== 'undefined' &&
      typeof (window as any).webkitConvertPointFromNodeToPage === 'function';

    // 闈濿ebKit娴忚鍣ㄤ笖鎾斁鍣ㄥ凡瀛樺湪锛屼娇鐢╯witch鏂规硶鍒囨崲
    if (!isWebkit && artPlayerRef.current && !playerCreatingRef.current) {
      try {
        artPlayerRef.current.switch = videoUrl;
        artPlayerRef.current.title = `${videoTitle} - 绗?{
          currentEpisodeIndex + 1
        }闆哷;
        artPlayerRef.current.poster = videoCover;
        if (artPlayerRef.current?.video) {
          ensureVideoSource(
            artPlayerRef.current.video as HTMLVideoElement,
            videoUrl
          );
        }
        return;
      } catch (error) {
        console.warn('鎾斁鍣ㄥ垏鎹㈠け璐ワ紝灏嗛噸鏂板垱寤?', error);
        // 濡傛灉鍒囨崲澶辫触锛岀户缁墽琛岄噸鏂板垱寤洪€昏緫
      }
    }

    // WebKit娴忚鍣ㄦ垨棣栨鍒涘缓锛氶攢姣佷箣鍓嶇殑鎾斁鍣ㄥ疄渚嬪苟鍒涘缓鏂扮殑
    if (artPlayerRef.current) {
      cleanupPlayer();
    }

    // 闃叉鐭椂闂村唴閲嶅鏋勫缓鎾斁鍣ㄥ鑷村涓疄渚嬪爢鍙?
    if (playerCreatingRef.current) {
      console.warn('鎾斁鍣ㄦ鍦ㄥ垱寤猴紝璺宠繃閲嶅鏋勫缓');
      return;
    }
    playerCreatingRef.current = true;

    // 娣诲姞闃叉姈寤惰繜锛岄伩鍏嶅揩閫熷垏鎹㈡椂鐨勯噸澶嶅垱寤?
    const createPlayerTimer = setTimeout(() => {
      if (!playerCreatingRef.current) return; // 濡傛灉宸茬粡琚彇娑堬紝鐩存帴杩斿洖

      try {
        // 鍒涘缓鏂扮殑鎾斁鍣ㄥ疄渚嬪墠锛屾竻绌哄鍣ㄤ腑鍙兘娈嬬暀鐨勮妭鐐?
        if (artRef.current) {
          try {
            while (artRef.current.firstChild) {
              artRef.current.removeChild(artRef.current.firstChild as any);
            }
          } catch (_) {
      // ignore
    }
        }
      // 鍒涘缓鏂扮殑鎾斁鍣ㄥ疄渚?
      Artplayer.PLAYBACK_RATE = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
      Artplayer.USE_RAF = true;

      artPlayerRef.current = new Artplayer({
        container: artRef.current,
        url: videoUrl,
        poster: videoCover,
        volume: 0.7,
        isLive: false,
        muted: false,
        autoplay: true,
        pip: true,
        autoSize: false,
        autoMini: false,
        screenshot: false,
        setting: true,
        loop: false,
        flip: false,
        playbackRate: true,
        aspectRatio: false,
        fullscreen: false,
        fullscreenWeb: false,
        subtitleOffset: false,
        miniProgressBar: false,
        mutex: true,
        playsInline: true,
        autoPlayback: false,
        airplay: true,
        theme: '#22c55e',
        lang: 'zh-cn',
        hotkey: false,
        fastForward: true,
        autoOrientation: true,
        lock: true,
        moreVideoAttr: {
          crossOrigin: 'anonymous',
        },
        // HLS 鏀寔閰嶇疆
        customType: {
          m3u8: function (video: HTMLVideoElement, url: string) {
            if (!Hls) {
              console.error('HLS.js 鏈姞杞?);
              return;
            }

            if (video.hls) {
              video.hls.destroy();
            }
            const hls = new Hls({
              debug: false, // 鍏抽棴鏃ュ織
              enableWorker: true, // WebWorker 瑙ｇ爜锛岄檷浣庝富绾跨▼鍘嬪姏
              lowLatencyMode: true, // 寮€鍚綆寤惰繜 LL-HLS

              /* 缂撳啿/鍐呭瓨鐩稿叧 */
              maxBufferLength: 30, // 鍓嶅悜缂撳啿鏈€澶?30s锛岃繃澶у鏄撳鑷撮珮寤惰繜
              backBufferLength: 30, // 浠呬繚鐣?30s 宸叉挱鏀惧唴瀹癸紝閬垮厤鍐呭瓨鍗犵敤
              maxBufferSize: 60 * 1000 * 1000, // 绾?60MB锛岃秴鍑哄悗瑙﹀彂娓呯悊

              /* 鑷畾涔塴oader */
              loader: blockAdEnabledRef.current
                ? CustomHlsJsLoader
                : Hls.DefaultConfig.loader,
            });

            hls.loadSource(url);
            hls.attachMedia(video);
            video.hls = hls;

            ensureVideoSource(video, url);

            hls.on(Hls.Events.ERROR, function (event: any, data: any) {
              console.error('HLS Error:', event, data);
              if (data.fatal) {
                switch (data.type) {
                  case Hls.ErrorTypes.NETWORK_ERROR:
                    console.log('缃戠粶閿欒锛屽皾璇曟仮澶?..');
                    hls.startLoad();
                    break;
                  case Hls.ErrorTypes.MEDIA_ERROR:
                    console.log('濯掍綋閿欒锛屽皾璇曟仮澶?..');
                    hls.recoverMediaError();
                    break;
                  default:
                    console.log('鏃犳硶鎭㈠鐨勯敊璇?);
                    hls.destroy();
                    break;
                }
              }
            });
          },
        },
        icons: {
          loading:
            '<img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI1MCIgaGVpZ2h0PSI1MCIgdmlld0JveD0iMCAwIDUwIDUwIj48cGF0aCBkPSJNMjUuMjUxIDYuNDYxYy0xMC4zMTggMC0xOC42ODMgOC4zNjUtMTguNjgzIDE4LjY4M2g0LjA2OGMwLTguMDcgNi41NDUtMTQuNjE1IDE0LjYxNS0xNC42MTVWNi40NjF6IiBmaWxsPSIjMDA5Njg4Ij48YW5pbWF0ZVRyYW5zZm9ybSBhdHRyaWJ1dGVOYW1lPSJ0cmFuc2Zvcm0iIGF0dHJpYnV0ZVR5cGU9IlhNTCIgZHVyPSIxcyIgZnJvbT0iMCAyNSAyNSIgcmVwZWF0Q291bnQ9ImluZGVmaW5pdGUiIHRvPSIzNjAgMjUgMjUiIHR5cGU9InJvdGF0ZSIvPjwvcGF0aD48L3N2Zz4=">',
        },
        settings: [
          ...(AI4K_FORCE_DISABLE
            ? []
            : [
                {
                  html: 'AI澧炲己4K',
                  icon: '<text x="50%" y="50%" font-size="18" font-weight="bold" text-anchor="middle" dominant-baseline="middle" fill="#22c55e">AI</text>',
                  tooltip: aiEnhanceEnabled ? '宸插紑鍚? : '宸插叧闂?,
                  onClick() {
                    const newVal = !aiEnhanceEnabled;
                    try {
                      localStorage.setItem('enable_ai_enhance', String(newVal));
                      // 鍒囨崲鏃堕噸寤烘挱鏀惧櫒锛氫繚瀛樿繘搴﹀苟閿€姣佸疄渚嬶紝鏁堟灉鐢熸晥鏇寸ǔ瀹?
                      if (artPlayerRef.current) {
                        resumeTimeRef.current = artPlayerRef.current.currentTime;
                        if (artPlayerRef.current.video && artPlayerRef.current.video.hls) {
                          artPlayerRef.current.video.hls.destroy();
                        }
                        artPlayerRef.current.destroy();
                        artPlayerRef.current = null;
                      }
                      setAiEnhanceEnabled(newVal);
                    } catch (_) {
                      // ignore
                    }
                    return newVal ? '褰撳墠寮€鍚? : '褰撳墠鍏抽棴';
                  },
                },
                {
                  html: 'AI澧炲己绾у埆',
                  icon: '<text x="50%" y="50%" font-size="16" font-weight="bold" text-anchor="middle" dominant-baseline="middle" fill="#3b82f6">绾?/text>',
                  tooltip: `褰撳墠: ${aiEnhanceLevel === 'standard' ? '鏍囧噯' : aiEnhanceLevel === 'advanced' ? '楂樼骇' : '鏋佽嚧'}`,
                  onClick() {
                    const levels = ['standard', 'advanced', 'extreme'] as const;
                    const levelNames = ['鏍囧噯', '楂樼骇', '鏋佽嚧'];
                    const currentIndex = levels.indexOf(aiEnhanceLevel);
                    const nextIndex = (currentIndex + 1) % levels.length;
                    const newLevel = levels[nextIndex];
                    
                    try {
                      localStorage.setItem('ai_enhance_level', newLevel);
                      setAiEnhanceLevel(newLevel);
                      
                      // 濡傛灉AI澧炲己宸插紑鍚紝閲嶅缓鎾斁鍣ㄤ互搴旂敤鏂扮骇鍒?
                      if (aiEnhanceEnabled && artPlayerRef.current) {
                        resumeTimeRef.current = artPlayerRef.current.currentTime;
                        if (artPlayerRef.current.video && artPlayerRef.current.video.hls) {
                          artPlayerRef.current.video.hls.destroy();
                        }
                        artPlayerRef.current.destroy();
                        artPlayerRef.current = null;
                      }
                    } catch (_) {
                      // ignore
                    }
                    return `褰撳墠: ${levelNames[nextIndex]}`;
                  },
                },
              ]),
          {
            html: '鍘诲箍鍛?,
            icon: '<text x="50%" y="50%" font-size="20" font-weight="bold" text-anchor="middle" dominant-baseline="middle" fill="#ffffff">AD</text>',
            tooltip: blockAdEnabled ? '宸插紑鍚? : '宸插叧闂?,
            onClick() {
              const newVal = !blockAdEnabled;
              try {
                localStorage.setItem('enable_blockad', String(newVal));
                if (artPlayerRef.current) {
                  resumeTimeRef.current = artPlayerRef.current.currentTime;
                  if (
                    artPlayerRef.current.video &&
                    artPlayerRef.current.video.hls
                  ) {
                    artPlayerRef.current.video.hls.destroy();
                  }
                  artPlayerRef.current.destroy();
                  artPlayerRef.current = null;
                }
                setBlockAdEnabled(newVal);
              } catch (_) {
                // ignore
              }
              return newVal ? '褰撳墠寮€鍚? : '褰撳墠鍏抽棴';
            },
          },
          {
            name: '璺宠繃鐗囧ご鐗囧熬',
            html: '璺宠繃鐗囧ご鐗囧熬',
            switch: skipConfigRef.current.enable,
            onSwitch: function (item) {
              const newConfig = {
                ...skipConfigRef.current,
                enable: !item.switch,
              };
              handleSkipConfigChange(newConfig);
              return !item.switch;
            },
          },
          {
            html: '鍒犻櫎璺宠繃閰嶇疆',
            onClick: function () {
              handleSkipConfigChange({
                enable: false,
                intro_time: 0,
                outro_time: 0,
              });
              return '';
            },
          },
          {
            name: '璁剧疆鐗囧ご',
            html: '璁剧疆鐗囧ご',
            icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="12" r="2" fill="#ffffff"/><path d="M9 12L17 12" stroke="#ffffff" stroke-width="2"/><path d="M17 6L17 18" stroke="#ffffff" stroke-width="2"/></svg>',
            tooltip:
              skipConfigRef.current.intro_time === 0
                ? '璁剧疆鐗囧ご鏃堕棿'
                : `${formatTime(skipConfigRef.current.intro_time)}`,
            onClick: function () {
              const currentTime = artPlayerRef.current?.currentTime || 0;
              if (currentTime > 0) {
                const newConfig = {
                  ...skipConfigRef.current,
                  intro_time: currentTime,
                };
                handleSkipConfigChange(newConfig);
                return `${formatTime(currentTime)}`;
              }
            },
          },
          {
            name: '璁剧疆鐗囧熬',
            html: '璁剧疆鐗囧熬',
            icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 6L7 18" stroke="#ffffff" stroke-width="2"/><path d="M7 12L15 12" stroke="#ffffff" stroke-width="2"/><circle cx="19" cy="12" r="2" fill="#ffffff"/></svg>',
            tooltip:
              skipConfigRef.current.outro_time >= 0
                ? '璁剧疆鐗囧熬鏃堕棿'
                : `-${formatTime(-skipConfigRef.current.outro_time)}`,
            onClick: function () {
              const outroTime =
                -(
                  artPlayerRef.current?.duration -
                  artPlayerRef.current?.currentTime
                ) || 0;
              if (outroTime < 0) {
                const newConfig = {
                  ...skipConfigRef.current,
                  outro_time: outroTime,
                };
                handleSkipConfigChange(newConfig);
                return `-${formatTime(-outroTime)}`;
              }
            },
          },
        ],
        // 鎺у埗鏍忛厤缃?
        controls: [
          {
            position: 'left',
            index: 13,
            html: '<i class="art-icon flex"><svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" fill="currentColor"/></svg></i>',
            tooltip: '鎾斁涓嬩竴闆?,
            click: function () {
              handleNextEpisode();
            },
          },
          {
            position: 'right',
            index: 50,
            html: '<i class="art-icon flex"><svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 8V3h5v2H5v3H3zm11-5h5v5h-2V5h-3V3zM3 14h2v3h3v2H3v-5zm14 3v-3h2v5h-5v-2h3z" fill="currentColor"/></svg></i>',
            tooltip: '鍏ㄥ睆',
            click: function () {
              const art = artPlayerRef.current;
              if (!art) return;
              if (!art.fullscreen) {
                setIsEnteringFullscreen(true);
                setTimeout(() => {
                  try {
                    art.fullscreen = true;
                  } finally {
                    setIsEnteringFullscreen(false);
                  }
                }, 400);
              } else {
                art.fullscreen = false;
              }
            },
          },
        ],
      });

      // 鐩戝惉鎾斁鍣ㄤ簨浠?
      artPlayerRef.current.on('ready', () => {
        playerCreatingRef.current = false;
        setError(null);

        // 鎾斁鍣ㄥ氨缁悗锛屽鏋滄鍦ㄦ挱鏀惧垯璇锋眰 Wake Lock
        if (artPlayerRef.current && !artPlayerRef.current.paused) {
          requestWakeLock();
        }

        // 鑻ュ紑鍚疉I澧炲己涓旀湭寮哄埗鍏抽棴锛屽垯鍚姩娓叉煋
        try {
          if (!AI4K_FORCE_DISABLE && aiEnhanceEnabledRef.current && artPlayerRef.current?.video) {
            startAiEnhancer(artPlayerRef.current.video as HTMLVideoElement);
          }
        } catch (_) {
      // ignore
    }

        // 搴旂敤鑷姩绛栫暐锛堣嫢鏈墜鍔ㄥ紑鍚級
        applyAiEnhancePolicy();
      });

      // 鐩戝惉鎾斁鐘舵€佸彉鍖栵紝鎺у埗 Wake Lock
      artPlayerRef.current.on('play', () => {
        requestWakeLock();
      });

      artPlayerRef.current.on('pause', () => {
        releaseWakeLock();
        saveCurrentPlayProgress();
      });

      artPlayerRef.current.on('video:ended', () => {
        releaseWakeLock();
      });

      // 濡傛灉鎾斁鍣ㄥ垵濮嬪寲鏃跺凡缁忓湪鎾斁鐘舵€侊紝鍒欒姹?Wake Lock
      if (artPlayerRef.current && !artPlayerRef.current.paused) {
        requestWakeLock();
      }

      artPlayerRef.current.on('video:volumechange', () => {
        lastVolumeRef.current = artPlayerRef.current.volume;
      });
      artPlayerRef.current.on('video:ratechange', () => {
        lastPlaybackRateRef.current = artPlayerRef.current.playbackRate;
      });

      // 鐩戝惉瑙嗛鍙挱鏀句簨浠讹紝杩欐椂鎭㈠鎾斁杩涘害鏇村彲闈?
      artPlayerRef.current.on('video:canplay', () => {
        // 鑻ュ瓨鍦ㄩ渶瑕佹仮澶嶇殑鎾斁杩涘害锛屽垯璺宠浆
        if (resumeTimeRef.current && resumeTimeRef.current > 0) {
          try {
            const duration = artPlayerRef.current.duration || 0;
            let target = resumeTimeRef.current;
            if (duration && target >= duration - 2) {
              target = Math.max(0, duration - 5);
            }
            artPlayerRef.current.currentTime = target;
            console.log('鎴愬姛鎭㈠鎾斁杩涘害鍒?', resumeTimeRef.current);
          } catch (err) {
            console.warn('鎭㈠鎾斁杩涘害澶辫触:', err);
          }
        }
        resumeTimeRef.current = null;

        setTimeout(() => {
          if (
            Math.abs(artPlayerRef.current.volume - lastVolumeRef.current) > 0.01
          ) {
            artPlayerRef.current.volume = lastVolumeRef.current;
          }
          if (
            Math.abs(
              artPlayerRef.current.playbackRate - lastPlaybackRateRef.current
            ) > 0.01 &&
            isWebkit
          ) {
            artPlayerRef.current.playbackRate = lastPlaybackRateRef.current;
          }
          artPlayerRef.current.notice.show = '';
        }, 0);

        // 闅愯棌鎹㈡簮鍔犺浇鐘舵€?
        setIsVideoLoading(false);
      });

      // 鐩戝惉瑙嗛鏃堕棿鏇存柊浜嬩欢锛屽疄鐜拌烦杩囩墖澶寸墖灏?
      artPlayerRef.current.on('video:timeupdate', () => {
        if (!skipConfigRef.current.enable) return;

        const currentTime = artPlayerRef.current.currentTime || 0;
        const duration = artPlayerRef.current.duration || 0;
        const now = Date.now();

        // 闄愬埗璺宠繃妫€鏌ラ鐜囦负1.5绉掍竴娆?
        if (now - lastSkipCheckRef.current < 1500) return;
        lastSkipCheckRef.current = now;

        // 璺宠繃鐗囧ご
        if (
          skipConfigRef.current.intro_time > 0 &&
          currentTime < skipConfigRef.current.intro_time
        ) {
          artPlayerRef.current.currentTime = skipConfigRef.current.intro_time;
          artPlayerRef.current.notice.show = `宸茶烦杩囩墖澶?(${formatTime(
            skipConfigRef.current.intro_time
          )})`;
        }

        // 璺宠繃鐗囧熬
        if (
          skipConfigRef.current.outro_time < 0 &&
          duration > 0 &&
          currentTime >
            artPlayerRef.current.duration + skipConfigRef.current.outro_time
        ) {
          if (
            currentEpisodeIndexRef.current <
            (detailRef.current?.episodes?.length || 1) - 1
          ) {
            handleNextEpisode();
          } else {
            artPlayerRef.current.pause();
          }
          artPlayerRef.current.notice.show = `宸茶烦杩囩墖灏?(${formatTime(
            skipConfigRef.current.outro_time
          )})`;
        }
      });

      artPlayerRef.current.on('error', (err: any) => {
        console.error('鎾斁鍣ㄩ敊璇?', err);
        if (artPlayerRef.current.currentTime > 0) {
          return;
        }
      });

      // 鐩戝惉瑙嗛鎾斁缁撴潫浜嬩欢锛岃嚜鍔ㄦ挱鏀句笅涓€闆?
      artPlayerRef.current.on('video:ended', () => {
        const d = detailRef.current;
        const idx = currentEpisodeIndexRef.current;
        if (d && d.episodes && idx < d.episodes.length - 1) {
          setTimeout(() => {
            setCurrentEpisodeIndex(idx + 1);
          }, 1000);
        }
      });

      artPlayerRef.current.on('video:timeupdate', () => {
        throttleSaveProgress();
      });

      artPlayerRef.current.on('pause', () => {
        saveCurrentPlayProgress();
      });

      if (artPlayerRef.current?.video) {
        ensureVideoSource(
          artPlayerRef.current.video as HTMLVideoElement,
          videoUrl
        );
      }
      } catch (err) {
        console.error('鍒涘缓鎾斁鍣ㄥけ璐?', err);
        setError('鎾斁鍣ㄥ垵濮嬪寲澶辫触');
        playerCreatingRef.current = false;
      }
    }, 100); // 100ms闃叉姈寤惰繜

    // 杩斿洖娓呯悊鍑芥暟锛岀敤浜庡彇娑堝畾鏃跺櫒
    return () => {
      clearTimeout(createPlayerTimer);
      playerCreatingRef.current = false;
    };
  }, [Artplayer, Hls, videoUrl, loading, blockAdEnabled, aiEnhanceEnabled]);

  // 褰撶粍浠跺嵏杞芥椂娓呯悊瀹氭椂鍣ㄣ€乄ake Lock 鍜屾挱鏀惧櫒璧勬簮
  useEffect(() => {
    return () => {
      // 娓呯悊瀹氭椂鍣?
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
      }

      // 閲婃斁 Wake Lock
      releaseWakeLock();

      // 閿€姣佹挱鏀惧櫒瀹炰緥
      cleanupPlayer();
    };
  }, []);

  if (loading) {
    return (
      <PageLayout activePath='/play'>
        <div className='flex items-center justify-center min-h-screen bg-transparent'>
          <div className='text-center max-w-md mx-auto px-6'>
            {/* 鍔ㄧ敾褰遍櫌鍥炬爣 */}
            <div className='relative mb-8'>
              <div className='relative mx-auto w-24 h-24 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl shadow-2xl flex items-center justify-center transform hover:scale-105 transition-transform duration-300'>
                <div className='text-white text-4xl'>
                  {loadingStage === 'searching' && '馃攳'}
                  {loadingStage === 'preferring' && '鈿?}
                  {loadingStage === 'fetching' && '馃幀'}
                  {loadingStage === 'ready' && '鉁?}
                </div>
                {/* 鏃嬭浆鍏夌幆 */}
                <div className='absolute -inset-2 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl opacity-20 animate-spin'></div>
              </div>

              {/* 娴姩绮掑瓙鏁堟灉 */}
              <div className='absolute top-0 left-0 w-full h-full pointer-events-none'>
                <div className='absolute top-2 left-2 w-2 h-2 bg-green-400 rounded-full animate-bounce'></div>
                <div
                  className='absolute top-4 right-4 w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce'
                  style={{ animationDelay: '0.5s' }}
                ></div>
                <div
                  className='absolute bottom-3 left-6 w-1 h-1 bg-lime-400 rounded-full animate-bounce'
                  style={{ animationDelay: '1s' }}
                ></div>
              </div>
            </div>

            {/* 杩涘害鎸囩ず鍣?*/}
            <div className='mb-6 w-80 mx-auto'>
              <div className='flex justify-center space-x-2 mb-4'>
                <div
                  className={`w-3 h-3 rounded-full transition-all duration-500 ${
                    loadingStage === 'searching' || loadingStage === 'fetching'
                      ? 'bg-green-500 scale-125'
                      : loadingStage === 'preferring' ||
                        loadingStage === 'ready'
                      ? 'bg-green-500'
                      : 'bg-gray-300'
                  }`}
                ></div>
                <div
                  className={`w-3 h-3 rounded-full transition-all duration-500 ${
                    loadingStage === 'preferring'
                      ? 'bg-green-500 scale-125'
                      : loadingStage === 'ready'
                      ? 'bg-green-500'
                      : 'bg-gray-300'
                  }`}
                ></div>
                <div
                  className={`w-3 h-3 rounded-full transition-all duration-500 ${
                    loadingStage === 'ready'
                      ? 'bg-green-500 scale-125'
                      : 'bg-gray-300'
                  }`}
                ></div>
              </div>

              {/* 杩涘害鏉?*/}
              <div className='w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden'>
                <div
                  className='h-full bg-gradient-to-r from-green-500 to-emerald-600 rounded-full transition-all duration-1000 ease-out'
                  style={{
                    width:
                      loadingStage === 'searching' ||
                      loadingStage === 'fetching'
                        ? '33%'
                        : loadingStage === 'preferring'
                        ? '66%'
                        : '100%',
                  }}
                ></div>
              </div>
            </div>

            {/* 鍔犺浇娑堟伅 */}
            <div className='space-y-2'>
              <p className='text-xl font-semibold text-gray-800 dark:text-gray-200 animate-pulse'>
                {loadingMessage}
              </p>
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout activePath='/play'>
        <div className='flex items-center justify-center min-h-screen bg-transparent'>
          <div className='text-center max-w-md mx-auto px-6'>
            {/* 閿欒鍥炬爣 */}
            <div className='relative mb-8'>
              <div className='relative mx-auto w-24 h-24 bg-gradient-to-r from-red-500 to-orange-500 rounded-2xl shadow-2xl flex items-center justify-center transform hover:scale-105 transition-transform duration-300'>
                <div className='text-white text-4xl'>馃樀</div>
                {/* 鑴夊啿鏁堟灉 */}
                <div className='absolute -inset-2 bg-gradient-to-r from-red-500 to-orange-500 rounded-2xl opacity-20 animate-pulse'></div>
              </div>

              {/* 娴姩閿欒绮掑瓙 */}
              <div className='absolute top-0 left-0 w-full h-full pointer-events-none'>
                <div className='absolute top-2 left-2 w-2 h-2 bg-red-400 rounded-full animate-bounce'></div>
                <div
                  className='absolute top-4 right-4 w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce'
                  style={{ animationDelay: '0.5s' }}
                ></div>
                <div
                  className='absolute bottom-3 left-6 w-1 h-1 bg-yellow-400 rounded-full animate-bounce'
                  style={{ animationDelay: '1s' }}
                ></div>
              </div>
            </div>

            {/* 閿欒淇℃伅 */}
            <div className='space-y-4 mb-8'>
              <h2 className='text-2xl font-bold text-gray-800 dark:text-gray-200'>
                鍝庡憖锛屽嚭鐜颁簡涓€浜涢棶棰?
              </h2>
              <div className='bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4'>
                <p className='text-red-600 dark:text-red-400 font-medium'>
                  {error}
                </p>
              </div>
              <p className='text-sm text-gray-500 dark:text-gray-400'>
                璇锋鏌ョ綉缁滆繛鎺ユ垨灏濊瘯鍒锋柊椤甸潰
              </p>
            </div>

            {/* 鎿嶄綔鎸夐挳 */}
            <div className='space-y-3'>
              <button
                onClick={() =>
                  videoTitle
                    ? router.push(`/search?q=${encodeURIComponent(videoTitle)}`)
                    : router.back()
                }
                className='w-full px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-medium hover:from-green-600 hover:to-emerald-700 transform hover:scale-105 transition-all duration-200 shadow-lg hover:shadow-xl'
              >
                {videoTitle ? '馃攳 杩斿洖鎼滅储' : '鈫?杩斿洖涓婇〉'}
              </button>

              <button
                onClick={() => window.location.reload()}
                className='w-full px-6 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors duration-200'
              >
                馃攧 閲嶆柊灏濊瘯
              </button>
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout activePath='/play'>
      <div className='flex flex-col gap-3 py-4 px-5 lg:px-[3rem] 2xl:px-20'>
        {/* 绗竴琛岋細褰辩墖鏍囬 */}
        <div className='py-1'>
          <h1 className='text-xl font-semibold text-gray-900 dark:text-gray-100'>
            {videoTitle || '褰辩墖鏍囬'}
            {totalEpisodes > 1 && (
              <span className='text-gray-500 dark:text-gray-400'>
                {` > 绗?${currentEpisodeIndex + 1} 闆哷}
              </span>
            )}
          </h1>
        </div>
        {/* 绗簩琛岋細鎾斁鍣ㄥ拰閫夐泦 */}
        <div className='space-y-2'>
          {/* 鎶樺彔鎺у埗 - 浠呭湪 lg 鍙婁互涓婂睆骞曟樉绀?*/}
          <div className='hidden lg:flex justify-end'>
            <button
              onClick={() =>
                setIsEpisodeSelectorCollapsed(!isEpisodeSelectorCollapsed)
              }
              className='group relative flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-white/80 hover:bg-white dark:bg-gray-800/80 dark:hover:bg-gray-800 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 shadow-sm hover:shadow-lg hover:scale-105 transition-all duration-300 ease-out'
              title={
                isEpisodeSelectorCollapsed ? '鏄剧ず閫夐泦闈㈡澘' : '闅愯棌閫夐泦闈㈡澘'
              }
            >
              <svg
                className={`w-3.5 h-3.5 text-gray-500 dark:text-gray-400 transition-all duration-500 ease-out ${
                  isEpisodeSelectorCollapsed ? 'rotate-180 text-orange-500' : 'rotate-0 text-green-500'
                }`}
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth='2'
                  d='M9 5l7 7-7 7'
                />
              </svg>
              <span className='text-xs font-medium text-gray-600 dark:text-gray-300 transition-colors duration-300'>
                {isEpisodeSelectorCollapsed ? '鏄剧ず' : '闅愯棌'}
              </span>

              {/* 绮捐嚧鐨勭姸鎬佹寚绀虹偣 */}
              <div
                className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full transition-all duration-500 ease-out ${
                  isEpisodeSelectorCollapsed
                    ? 'bg-orange-400 animate-pulse scale-110'
                    : 'bg-green-400 scale-100'
                }`}
              ></div>
            </button>
          </div>

          <div
            className={`grid gap-4 lg:h-[500px] xl:h-[650px] 2xl:h-[750px] transition-[grid-template-columns] duration-500 ease-out grid-cols-1 ${
              isEpisodeSelectorCollapsed ? 'md:grid-cols-[1fr_0fr]' : 'md:grid-cols-[3fr_1fr]'
            }`}
          >
            {/* 鎾斁鍣?*/}
            <div
              className='h-full transition-all duration-500 ease-out transform-gpu rounded-xl border border-white/0 dark:border-white/30 col-span-1 md:col-span-1'
            >
              <div ref={playerContainerRef} className={`relative w-full h-[300px] lg:h-full group transition-transform duration-300 ease-out ${isEnteringFullscreen ? 'transform-gpu scale-[1.04]' : ''}`}>
                <div
                  ref={artRef}
                  className='bg-black w-full h-full rounded-xl overflow-hidden shadow-lg'
                ></div>
                <div className='pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500'></div>
                <div className='pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500'></div>
                <div className='absolute top-3 left-3 z-[600]'>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold backdrop-blur bg-white/15 text-white border border-white/20 transition-transform duration-200 ${aiEnhanceEnabled ? 'ring-2 ring-emerald-400 scale-100' : 'opacity-60 scale-95'}`}>{aiEnhanceEnabled ? 'AI澧炲己' : 'AI鍏抽棴'}</span>
                </div>

                {/* 鎹㈡簮鍔犺浇钂欏眰 */}
                {isVideoLoading && (
                  <div className='absolute inset-0 bg-black/85 backdrop-blur-sm rounded-xl flex items-center justify-center z-[500] transition-all duration-300'>
                    <div className='text-center max-w-md mx-auto px-6'>
                      {/* 鍔ㄧ敾褰遍櫌鍥炬爣 */}
                      <div className='relative mb-8'>
                        <div className='relative mx-auto w-24 h-24 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl shadow-2xl flex items-center justify-center transform hover:scale-105 transition-transform duration-300'>
                          <div className='text-white text-4xl'>馃幀</div>
                          {/* 鏃嬭浆鍏夌幆 */}
                          <div className='absolute -inset-2 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl opacity-20 animate-spin'></div>
                        </div>

                        {/* 娴姩绮掑瓙鏁堟灉 */}
                        <div className='absolute top-0 left-0 w-full h-full pointer-events-none'>
                          <div className='absolute top-2 left-2 w-2 h-2 bg-green-400 rounded-full animate-bounce'></div>
                          <div
                            className='absolute top-4 right-4 w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce'
                            style={{ animationDelay: '0.5s' }}
                          ></div>
                          <div
                            className='absolute bottom-3 left-6 w-1 h-1 bg-lime-400 rounded-full animate-bounce'
                            style={{ animationDelay: '1s' }}
                          ></div>
                        </div>
                      </div>

                      {/* 鎹㈡簮娑堟伅 */}
                      <div className='space-y-2'>
                        <p className='text-xl font-semibold text-white animate-pulse'>
                          {videoLoadingStage === 'sourceChanging'
                            ? '馃攧 鍒囨崲鎾斁婧?..'
                            : '馃攧 瑙嗛鍔犺浇涓?..'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 閫夐泦鍜屾崲婧?- 鍦ㄧЩ鍔ㄧ濮嬬粓鏄剧ず锛屽湪 lg 鍙婁互涓婂彲鎶樺彔 */}
            <div
              className={`h-[300px] lg:h-full md:overflow-hidden transition-all duration-500 ease-out transform-gpu ${
                isEpisodeSelectorCollapsed
                  ? 'md:col-span-1 lg:w-0 lg:opacity-0 lg:scale-95 lg:translate-x-4'
                  : 'md:col-span-1 lg:w-full lg:opacity-100 lg:scale-100 lg:translate-x-0'
              }`}
            >
              <EpisodeSelector
                totalEpisodes={totalEpisodes}
                episodes_titles={detail?.episodes_titles || []}
                value={currentEpisodeIndex + 1}
                onChange={handleEpisodeChange}
                onSourceChange={handleSourceChange}
                currentSource={currentSource}
                currentId={currentId}
                videoTitle={searchTitle || videoTitle}
                availableSources={availableSources}
                sourceSearchLoading={sourceSearchLoading}
                sourceSearchError={sourceSearchError}
                precomputedVideoInfo={precomputedVideoInfo}
              />
            </div>
          </div>
        </div>

        {/* 璇︽儏灞曠ず */}
        <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
          {/* 鏂囧瓧鍖?*/}
          <div className='md:col-span-3'>
            <div className='p-6 flex flex-col min-h-0'>
              {/* 鏍囬 */}
              <h1 className='text-3xl font-bold mb-2 tracking-wide flex items-center flex-shrink-0 text-center md:text-left w-full group/title'>
                <span className='transition-all duration-300 group-hover/title:scale-105 group-hover/title:drop-shadow-lg group-hover/title:text-emerald-600 dark:group-hover/title:text-emerald-400'>
                  {videoTitle || '褰辩墖鏍囬'}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleFavorite();
                  }}
                  className='ml-3 flex-shrink-0 relative group/fav transition-all duration-300 hover:scale-110 hover:drop-shadow-xl'
                >
                  <div className='absolute inset-0 bg-gradient-to-r from-pink-500 to-rose-500 rounded-full opacity-0 group-hover/fav:opacity-20 blur-md transition-opacity duration-300'></div>
                  <FavoriteIcon filled={favorited} />
                </button>
              </h1>

              {/* 鍏抽敭淇℃伅琛?*/}
              <div className='flex flex-wrap items-center gap-3 text-base mb-4 opacity-80 flex-shrink-0'>
                {detail?.class && (
                  <span className='text-green-600 font-semibold'>
                    {detail.class}
                  </span>
                )}
                {(detail?.year || videoYear) && (
                  <span>{detail?.year || videoYear}</span>
                )}
                {detail?.source_name && (
                  <span className='border border-gray-500/60 px-2 py-[1px] rounded'>
                    {detail.source_name}
                  </span>
                )}
                {detail?.type_name && <span>{detail.type_name}</span>}
              </div>
              {/* 鍓ф儏绠€浠?*/}
              {detail?.desc && (
                <div
                  className='mt-0 text-base leading-relaxed opacity-90 overflow-y-auto pr-2 flex-1 min-h-0 scrollbar-hide'
                  style={{ whiteSpace: 'pre-line' }}
                >
                  {detail.desc}
                </div>
              )}
            </div>
          </div>

          {/* 灏侀潰灞曠ず */}
          <div className='hidden md:block md:col-span-1 md:order-first'>
            <div className='pl-0 py-4 pr-6'>
              <div className='relative bg-gray-300 dark:bg-gray-700 aspect-[2/3] flex items-center justify-center rounded-xl overflow-hidden'>
                {videoCover ? (
                  <>
                    <img
                      src={processImageUrl(videoCover)}
                      alt={videoTitle}
                      className='w-full h-full object-cover'
                    />

                    {/* 璞嗙摚閾炬帴鎸夐挳 */}
                    {videoDoubanId !== 0 && (
                      <a
                        href={`https://movie.douban.com/subject/${videoDoubanId.toString()}`}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='absolute top-3 left-3'
                      >
                        <div className='bg-green-500 text-white text-xs font-bold w-8 h-8 rounded-full flex items-center justify-center shadow-md hover:bg-green-600 hover:scale-[1.1] transition-all duration-300 ease-out'>
                          <svg
                            width='16'
                            height='16'
                            viewBox='0 0 24 24'
                            fill='none'
                            stroke='currentColor'
                            strokeWidth='2'
                            strokeLinecap='round'
                            strokeLinejoin='round'
                          >
                            <path d='M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71'></path>
                            <path d='M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'></path>
                          </svg>
                        </div>
                      </a>
                    )}
                  </>
                ) : (
                  <span className='text-gray-600 dark:text-gray-400'>
                    灏侀潰鍥剧墖
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

// FavoriteIcon 缁勪欢
const FavoriteIcon = ({ filled }: { filled: boolean }) => {
  if (filled) {
    return (
      <svg
        className='h-7 w-7'
        viewBox='0 0 24 24'
        xmlns='http://www.w3.org/2000/svg'
      >
        <path
          d='M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z'
          fill='#ef4444' /* Tailwind red-500 */
          stroke='#ef4444'
          strokeWidth='2'
          strokeLinecap='round'
          strokeLinejoin='round'
        />
      </svg>
    );
  }
  return (
    <Heart className='h-7 w-7 stroke-[1] text-gray-600 dark:text-gray-300' />
  );
};

export default function PlayPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PlayPageClient />
    </Suspense>
  );
}

