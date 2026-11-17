/**
 * Shared layout pieces for the (auth) route group — Design System rollout R5.1.
 *
 * Page ground is the design-system Backdrop (gradient; optional single pattern),
 * rendered absolutely behind a transparent `Screen`. Every block of text sits on a
 * glass or solid card (contrast rule in design-system/reference/README.md), never
 * directly on the ground. Behaviour (navigation, validation, API calls) stays in
 * the individual screens — this file is presentation only.
 */
import { EyeIcon, EyeOffIcon } from 'lucide-react-native';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { Backdrop, GlassCard, TextField, type BackdropPattern, type GlassCardVariant, type TextFieldProps } from '../../design';
import { Screen, type ScreenProps } from '../../theme/primitives';
import { useDesignTokens } from '../../theme/designTheme';

export interface AuthPageProps extends Omit<ScreenProps, 'style'> {
  /** One pattern per screen; only the welcome/intro heroes use the chevron. */
  pattern?: BackdropPattern;
  style?: StyleProp<ViewStyle>;
}

/** Backdrop + transparent Screen. */
export function AuthPage({ pattern, children, style, ...screenProps }: AuthPageProps) {
  return (
    <View style={styles.fill} testID="auth-page">
      <Backdrop variant="gradient" pattern={pattern} />
      <Screen {...screenProps} backdrop={false} style={[styles.transparent, style]}>
        {children}
      </Screen>
    </View>
  );
}

export interface AuthCardProps {
  variant?: GlassCardVariant;
  radius?: 'lg' | 'xl';
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Forms and long text use the solid card; short hero copy uses glass. */
export function AuthCard({ variant = 'solid', radius = 'lg', children, style, testID }: AuthCardProps) {
  return (
    <GlassCard variant={variant} radius={radius} style={style} testID={testID}>
      {children}
    </GlassCard>
  );
}

export interface AuthHeadingProps {
  title: string;
  subtitle?: string;
  /** display-lg for hero headlines; display-md (default) for screen titles. */
  size?: 'md' | 'lg';
  align?: 'left' | 'center';
  style?: StyleProp<ViewStyle>;
}

/** Screen title in the display face (Zilla Slab, never below 20px) + body subtitle in the sans face. */
export function AuthHeading({ title, subtitle, size = 'md', align = 'left', style }: AuthHeadingProps) {
  const t = useDesignTokens();
  const textAlign: TextStyle['textAlign'] = align;
  return (
    <View style={[{ marginBottom: subtitle ? t.spacing.s4 : t.spacing.s3 }, style]}>
      <Text accessibilityRole="header" style={[size === 'lg' ? t.type.displayLg : t.type.displayMd, { color: t.colors.ink, textAlign }]}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={[t.type.body, { color: t.colors.inkMuted, textAlign, marginTop: t.spacing.s2 }]}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

export interface AuthTextProps {
  children: React.ReactNode;
  tone?: 'body' | 'muted' | 'success';
  small?: boolean;
  align?: 'left' | 'center';
  style?: StyleProp<TextStyle>;
  testID?: string;
}

/** Body copy in the sans face with token colours. */
export function AuthText({ children, tone = 'muted', small = false, align = 'left', style, testID }: AuthTextProps) {
  const t = useDesignTokens();
  const color = tone === 'body' ? t.colors.ink : tone === 'success' ? t.colors.success : t.colors.inkMuted;
  return (
    <Text testID={testID} style={[small ? t.type.bodySm : t.type.body, { color, textAlign: align }, style]}>
      {children}
    </Text>
  );
}

export interface AuthLinkProps {
  /** Less vertical padding, for tight cards. */
  compact?: boolean;
  label: string;
  onPress: () => void;
  /** Leading plain text rendered before the link (e.g. "New here? "). */
  prefix?: string;
  align?: 'left' | 'center' | 'right';
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/** 48dp-tall text link row, `link` colour, sentence case. */
export function AuthLink({ label, onPress, prefix, align = 'center', accessibilityLabel, testID, style, compact = false }: AuthLinkProps) {
  const t = useDesignTokens();
  const justifyContent = align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center';
  return (
    <View style={[styles.linkRow, { justifyContent }, style]}>
      {prefix ? <Text style={[t.type.bodySm, { color: t.colors.inkMuted }]}>{prefix}</Text> : null}
      <Text
        accessibilityRole="link"
        accessibilityLabel={accessibilityLabel}
        testID={testID}
        onPress={onPress}
        style={[t.type.label, { color: t.colors.link, textDecorationLine: 'underline', paddingVertical: compact ? t.spacing.s2 : t.spacing.s3 }]}
      >
        {label}
      </Text>
    </View>
  );
}

/** Vertical rhythm between stacked fields / blocks (space-4). */
export function FieldGap() {
  const t = useDesignTokens();
  return <View style={{ height: t.spacing.s4 }} />;
}

/** TextField preset matching the old `Input type="email"` keyboard behaviour. */
export function EmailField(props: TextFieldProps) {
  return (
    <TextField
      keyboardType="email-address"
      autoCapitalize="none"
      autoCorrect={false}
      textContentType="emailAddress"
      autoComplete="email"
      {...props}
    />
  );
}

export type PasswordFieldProps = Omit<TextFieldProps, 'secureTextEntry' | 'trailing'>;

/** TextField with the show/hide toggle the old `Input type="password"` provided. */
export function PasswordField(props: PasswordFieldProps) {
  const t = useDesignTokens();
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOffIcon : EyeIcon;
  return (
    <TextField
      autoCapitalize="none"
      autoCorrect={false}
      textContentType="password"
      {...props}
      secureTextEntry={!visible}
      trailing={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
          onPress={() => setVisible((v) => !v)}
          hitSlop={8}
          style={styles.eye}
        >
          <Icon size={20} strokeWidth={1.75} color={t.colors.iconMuted} />
        </Pressable>
      }
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  transparent: { backgroundColor: 'transparent' },
  linkRow: { flexDirection: 'row', alignItems: 'center', minHeight: 48 },
  eye: { minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
});
