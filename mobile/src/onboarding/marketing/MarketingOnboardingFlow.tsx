import { useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ListRenderItem,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { markMarketingIntroComplete } from '../onboardingStorage';
import { Button, GlassCard } from '../../design';
import { AuthPage } from '../../screens/auth/AuthScaffold';
import { useDesignTokens } from '../../theme/designTheme';
import { minTouchTarget, spacing } from '../../theme/tokens';
import { AssetTypeGrid } from './components/AssetTypeGrid';
import { BrandLogo } from './components/BrandLogo';
import { FullDashboardMock } from './components/FullDashboardMock';
import { DemoBadge } from './components/DemoBadge';
import { MarketingSlideShell } from './components/MarketingSlideShell';
import { MockProtectionDashboard } from './components/MockProtectionDashboard';
import { PlanIntroPanel } from './components/PlanIntroPanel';
import { ProtectionMapHero } from './components/ProtectionMapHero';
import { StoryProgress } from './components/StoryProgress';
import { RecoveryFlowDiagram } from './components/RecoveryFlowDiagram';
import { ThreeStepGuide } from './components/ThreeStepGuide';
import { useAutoAdvance } from './hooks/useAutoAdvance';
import { useOnboardingLayout } from './hooks/useOnboardingLayout';
import { useReducedMotion } from './hooks/useReducedMotion';
import { useScreenFocused } from './hooks/useScreenFocused';
import { usePublicPlans } from './hooks/usePublicPlans';

/** How long each slide stays before the intro moves on by itself. */
const DWELL_MS = 6500;

type SlideId =
  | 'what-we-do'
  | 'protect'
  | 'track'
  | 'recovery'
  | 'dashboard'
  | 'steps'
  | 'plans'
  | 'account-gate';

interface Slide {
  id: SlideId;
  title: string;
  subtitle: string;
  footerLabel?: string;
}

const SLIDES: Slide[] = [
  {
    id: 'what-we-do',
    title: 'Meet TD IT Solution Insurance',
    subtitle:
      'We combine insurance and technology to help you protect the valuable assets that matter to you.',
    footerLabel: 'Next',
  },
  {
    id: 'protect',
    title: 'One place for all your assets',
    subtitle:
      'Add the devices and assets you want to protect and keep everything organised in one secure place.',
    footerLabel: 'Next',
  },
  {
    id: 'track',
    title: 'See where your assets are',
    subtitle:
      'Assets with a tracker, or your own phone, appear on the map. Speed, battery and signal show where the device reports them.',
    footerLabel: 'Next',
  },
  {
    id: 'recovery',
    title: "Lost or stolen? We're here to help",
    subtitle:
      'If your insured asset is lost or stolen, quickly report it through the app and start the appropriate support and recovery process.',
    footerLabel: 'Next',
  },
  {
    id: 'dashboard',
    title: 'Your protection. One app.',
    subtitle:
      'View coverage, assets, alerts and connected devices from a single dashboard.',
    footerLabel: 'Next',
  },
  {
    id: 'steps',
    title: 'Protecting your assets is simple',
    subtitle: 'Three straightforward steps to get started.',
    footerLabel: 'Get started',
  },
  {
    id: 'plans',
    title: 'Protection that fits your needs',
    subtitle: 'Choose a plan based on how many assets you want to protect.',
    footerLabel: 'Choose my protection',
  },
  {
    id: 'account-gate',
    title: "Let's protect what matters to you",
    subtitle:
      'Create your TD IT Solution Insurance account and start adding your assets.',
  },
];

/** The tracking slide: the example map sized to the slide's own width, with the same demo badge as the other slides. */
function TrackSlide() {
  const { isCompact } = useOnboardingLayout();
  const [areaWidth, setAreaWidth] = useState(0);
  return (
    <View onLayout={(e) => setAreaWidth(e.nativeEvent.layout.width)}>
      <DemoBadge />
      {areaWidth > 0 ? (
        <ProtectionMapHero width={areaWidth} height={isCompact ? 340 : 400} />
      ) : null}
    </View>
  );
}

function slideContent(item: Slide, plans: ReturnType<typeof usePublicPlans>) {
  switch (item.id) {
    case 'what-we-do':
      return <AssetTypeGrid />;
    case 'protect':
      return <MockProtectionDashboard />;
    case 'track':
      return <TrackSlide />;
    case 'recovery':
      return <RecoveryFlowDiagram />;
    case 'dashboard':
      return <FullDashboardMock />;
    case 'steps':
      return <ThreeStepGuide />;
    case 'plans':
      return (
        <PlanIntroPanel
          plans={plans.plans}
          loading={plans.loading}
          error={plans.error}
          usingFallback={plans.usingFallback}
          onRetry={plans.retry}
        />
      );
    default:
      return null;
  }
}

export function MarketingOnboardingFlow() {
  const router = useRouter();
  const listRef = useRef<FlatList<Slide>>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const plans = usePublicPlans();
  const { isCompact } = useOnboardingLayout();
  const t = useDesignTokens();
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const reduced = useReducedMotion();
  const focused = useScreenFocused();
  const [touching, setTouching] = useState(false);
  const [cycle, setCycle] = useState(0);

  const goToSlide = useCallback((index: number) => {
    listRef.current?.scrollToIndex({ index, animated: true });
    setActiveIndex(index);
  }, []);

  // The intro moves on by itself. It waits while a finger is on it, while another screen is on top, when the phone's
  // Reduce Motion setting is on, and it stops on the last slide (the account choice).
  const autoRunning =
    !reduced && focused && !touching && activeIndex < SLIDES.length - 1;
  useAutoAdvance({
    enabled: autoRunning,
    index: activeIndex,
    count: SLIDES.length,
    dwellMs: DWELL_MS,
    cycle,
    onAdvance: goToSlide,
  });

  const finishIntro = useCallback(
    async (destination: 'signup' | 'login') => {
      await markMarketingIntroComplete();
      if (destination === 'login') {
        router.push('/(auth)/login');
      } else {
        router.push({
          pathname: '/(auth)/get-started',
          params: { from: 'intro' },
        });
      }
    },
    [router],
  );

  const skipToAccount = useCallback(async () => {
    await markMarketingIntroComplete();
    goToSlide(SLIDES.length - 1);
  }, [goToSlide]);

  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
      setActiveIndex(index);
      setTouching(false);
      setCycle((c) => c + 1);
    },
    [SCREEN_WIDTH],
  );

  const renderSlide: ListRenderItem<Slide> = useCallback(
    ({ item, index }) => (
      <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
        {item.id === 'account-gate' ? (
          <MarketingSlideShell
            title={item.title}
            subtitle={item.subtitle}
            footerHidden
            inlineActions={
              <>
                <Button
                  label="Create account"
                  onPress={() => void finishIntro('signup')}
                />
                <Button
                  variant="secondary"
                  label="Log in"
                  onPress={() => void finishIntro('login')}
                />
              </>
            }
          />
        ) : (
          <MarketingSlideShell
            title={item.title}
            subtitle={item.subtitle}
            footerLabel={item.footerLabel}
            onFooterPress={() => goToSlide(index + 1)}
          >
            {slideContent(item, plans)}
          </MarketingSlideShell>
        )}
      </View>
    ),
    [SCREEN_WIDTH, finishIntro, goToSlide, plans],
  );

  return (
    <AuthPage
      pattern="chevron"
      scroll={false}
      padded={false}
      // the footer adds the bottom inset itself (Android navigation bar included), so the page must not add it too
      safeAreaEdges={['top']}
      contentContainerStyle={styles.screenBody}
    >
      <GlassCard style={styles.header} testID="intro-header-card">
        <View style={styles.headerTop}>
          {activeIndex < SLIDES.length - 1 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Skip introduction"
              onPress={() => void skipToAccount()}
              hitSlop={8}
              style={styles.headerSide}
            >
              <Text style={[t.type.label, { color: t.colors.inkMuted }]}>
                Skip
              </Text>
            </Pressable>
          ) : (
            <View style={styles.headerSide} />
          )}

          <View style={styles.headerLogoSlot}>
            <BrandLogo size="header" />
          </View>

          {activeIndex > 0 && activeIndex < SLIDES.length - 1 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={() => goToSlide(activeIndex - 1)}
              hitSlop={8}
              style={[styles.headerSide, styles.headerSideRight]}
            >
              <Text style={[t.type.label, { color: t.colors.link }]}>Back</Text>
            </Pressable>
          ) : (
            <View style={styles.headerSide} />
          )}
        </View>

        <StoryProgress
          count={SLIDES.length}
          activeIndex={activeIndex}
          dwellMs={DWELL_MS}
          running={autoRunning}
          cycle={cycle}
        />
      </GlassCard>

      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(item) => item.id}
        renderItem={renderSlide}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScrollBeginDrag={() => setTouching(true)}
        onMomentumScrollEnd={onMomentumScrollEnd}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
        style={styles.list}
      />
    </AuthPage>
  );
}

const styles = StyleSheet.create({
  screenBody: {
    flex: 1,
  },
  header: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: minTouchTarget,
    gap: spacing.xs,
  },
  headerSide: {
    width: 52,
    minHeight: minTouchTarget,
    justifyContent: 'center',
  },
  headerLogoSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSideRight: {
    alignItems: 'flex-end',
  },
  list: {
    flex: 1,
  },
  slide: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
});
