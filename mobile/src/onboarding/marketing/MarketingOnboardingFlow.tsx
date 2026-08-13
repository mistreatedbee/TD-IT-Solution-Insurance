import { useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItem,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { markMarketingIntroComplete } from '../onboardingStorage';
import { Button, Screen } from '../../theme/primitives';
import { colors, minTouchTarget, spacing, typography } from '../../theme/tokens';
import { AssetTypeGrid } from './components/AssetTypeGrid';
import { BrandLogo } from './components/BrandLogo';
import { FullDashboardMock } from './components/FullDashboardMock';
import { MapTrackingDemo } from './components/MapTrackingDemo';
import { MarketingSlideShell } from './components/MarketingSlideShell';
import { MockProtectionDashboard } from './components/MockProtectionDashboard';
import { PlanIntroPanel } from './components/PlanIntroPanel';
import { ProgressDots } from './components/ProgressDots';
import { RecoveryFlowDiagram } from './components/RecoveryFlowDiagram';
import { ThreeStepGuide } from './components/ThreeStepGuide';
import { useOnboardingLayout } from './hooks/useOnboardingLayout';
import { usePublicPlans } from './hooks/usePublicPlans';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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
    footerLabel: 'See how it works',
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
    title: 'Know where your asset is',
    subtitle:
      'For compatible insured assets with an assigned tracking device, view their latest available location directly from the app.',
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
    subtitle: 'View coverage, assets, alerts and connected devices from a single dashboard.',
    footerLabel: 'Next',
  },
  {
    id: 'steps',
    title: 'Protecting your assets is simple',
    subtitle: 'Three straightforward steps to get started.',
    footerLabel: "Let's get started",
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

function slideContent(item: Slide, plans: ReturnType<typeof usePublicPlans>) {
  switch (item.id) {
    case 'what-we-do':
      return <AssetTypeGrid />;
    case 'protect':
      return <MockProtectionDashboard />;
    case 'track':
      return <MapTrackingDemo />;
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
  const { buttonSize, isCompact } = useOnboardingLayout();

  const goToSlide = useCallback((index: number) => {
    listRef.current?.scrollToIndex({ index, animated: true });
    setActiveIndex(index);
  }, []);

  const finishIntro = useCallback(async (destination: 'signup' | 'login') => {
    await markMarketingIntroComplete();
    if (destination === 'login') {
      router.push('/(auth)/login');
    } else {
      router.push({ pathname: '/(auth)/get-started', params: { from: 'intro' } });
    }
  }, [router]);

  const skipToAccount = useCallback(async () => {
    await markMarketingIntroComplete();
    goToSlide(SLIDES.length - 1);
  }, [goToSlide]);

  const onMomentumScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setActiveIndex(index);
  }, []);

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
                <Button size={buttonSize} fullWidth onPress={() => void finishIntro('signup')}>
                  Create account
                </Button>
                <Button variant="secondary" size={buttonSize} fullWidth onPress={() => void finishIntro('login')}>
                  I already have an account
                </Button>
              </>
            }
          />
        ) : (
          <MarketingSlideShell
            title={item.title}
            subtitle={item.subtitle}
            footerLabel={item.footerLabel}
            onFooterPress={() => goToSlide(index + 1)}
            buttonSize={buttonSize}
          >
            {slideContent(item, plans)}
          </MarketingSlideShell>
        )}
      </View>
    ),
    [buttonSize, finishIntro, goToSlide, plans],
  );

  return (
    <Screen scroll={false} padded={false} style={styles.screen} contentContainerStyle={styles.screenBody}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          {activeIndex < SLIDES.length - 1 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Skip introduction"
              onPress={() => void skipToAccount()}
              hitSlop={8}
              style={styles.headerSide}
            >
              <Text style={styles.skipText}>Skip</Text>
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
              <Text style={styles.backText}>Back</Text>
            </Pressable>
          ) : (
            <View style={styles.headerSide} />
          )}
        </View>

        <ProgressDots count={SLIDES.length} activeIndex={activeIndex} compact={isCompact} />
      </View>

      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(item) => item.id}
        renderItem={renderSlide}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumScrollEnd}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
        style={styles.list}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  screenBody: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
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
  skipText: {
    fontSize: typography.sizes.sm,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  backText: {
    fontSize: typography.sizes.sm,
    fontWeight: '600',
    color: colors.primary,
  },
  list: {
    flex: 1,
  },
  slide: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
});
