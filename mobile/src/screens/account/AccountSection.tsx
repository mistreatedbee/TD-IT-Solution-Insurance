import React from 'react';
import { Text, View } from 'react-native';
import { useDesignTokens } from '../../theme/designTheme';

export function AccountSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const t = useDesignTokens();
  return (
    <View style={{ gap: t.spacing.s2 }}>
      <Text
        accessibilityRole="header"
        style={[
          t.type.labelSm,
          {
            color: t.colors.inkMuted,
            textTransform: 'uppercase',
            paddingHorizontal: t.spacing.s1,
          },
        ]}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}
