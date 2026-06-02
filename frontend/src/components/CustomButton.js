import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';

const CustomButton = ({
  title,
  onPress,
  type = 'primary', // primary, secondary, success, danger, outline
  loading = false,
  disabled = false,
  style,
  textStyle,
  ...props
}) => {
  const getButtonStyle = () => {
    if (disabled) return styles.disabled;
    switch (type) {
      case 'secondary':
        return styles.secondary;
      case 'success':
        return styles.success;
      case 'danger':
        return styles.danger;
      case 'outline':
        return styles.outline;
      case 'primary':
      default:
        return styles.primary;
    }
  };

  const getTextStyle = () => {
    if (disabled) return styles.disabledText;
    switch (type) {
      case 'outline':
        return styles.outlineText;
      default:
        return styles.btnText;
    }
  };

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={[styles.button, getButtonStyle(), style]}
      onPress={onPress}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={type === 'outline' ? Colors.secondary : Colors.white} size="small" />
      ) : (
        <Text style={[styles.text, getTextStyle(), textStyle]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    height: 48,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    width: '100%',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 2
  },
  primary: {
    backgroundColor: Colors.primary, // SaaS Green
    shadowColor: Colors.primary
  },
  secondary: {
    backgroundColor: Colors.secondary, // SaaS Blue
    shadowColor: Colors.secondary
  },
  success: {
    backgroundColor: Colors.success, // Green
    shadowColor: Colors.success
  },
  danger: {
    backgroundColor: Colors.danger,
    shadowColor: Colors.danger
  },
  outline: {
    backgroundColor: Colors.transparent,
    borderWidth: 1.5,
    borderColor: Colors.secondary, // Blue outline for secondary action
    elevation: 0
  },
  disabled: {
    backgroundColor: '#E2E8F0',
    elevation: 0
  },
  text: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2
  },
  btnText: {
    color: Colors.white
  },
  outlineText: {
    color: Colors.secondary
  },
  disabledText: {
    color: '#94A3B8'
  }
});

export default CustomButton;
