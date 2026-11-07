// src/components/ScreenErrorBoundary.tsx
import React from 'react';
import { View, Text, Pressable } from 'react-native';

type Props = { children: React.ReactNode };
type State = { error: Error | null };

export class ScreenErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Screen crash:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <Text style={{ fontWeight: '700', fontSize: 16, marginBottom: 8 }}>Có lỗi xảy ra</Text>
        <Text style={{ marginBottom: 16, textAlign: 'center' }}>{this.state.error.message}</Text>
        <Pressable onPress={() => this.setState({ error: null })}>
          <Text style={{ fontWeight: '700' }}>Thử lại</Text>
        </Pressable>
      </View>
    );
  }
}
