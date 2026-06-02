import React, { useState, useRef } from 'react';
import { View, TextInput, Text, StyleSheet, TouchableOpacity, TouchableWithoutFeedback } from 'react-native';
import { Colors } from '../theme/colors';

const CustomInput = ({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize = 'none',
  error,
  icon, // Prefix icon emoji or symbol
  required = false,
  ...props
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [isSecureVisible, setIsSecureVisible] = useState(false);
  const inputRef = useRef(null);

  const shouldBeSecure = secureTextEntry && !isSecureVisible;

  return (
    <View style={styles.container}>
      {label ? (
        <Text style={styles.label}>
          {label} {required ? <Text style={{ color: Colors.danger }}>*</Text> : null}
        </Text>
      ) : null}
      <TouchableWithoutFeedback onPress={() => inputRef.current?.focus()}>
        <View
          style={[
            styles.inputContainer,
            isFocused && styles.inputFocused,
            error ? styles.inputError : null
          ]}
        >
          {icon ? <Text style={styles.prefixIcon}>{icon}</Text> : null}
          
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor="#94A3B8"
            secureTextEntry={shouldBeSecure}
            keyboardType={keyboardType}
            autoCapitalize={autoCapitalize}
            autoComplete="off"
            autoCorrect={false}
            spellCheck={false}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            {...props}
          />

          {secureTextEntry ? (
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setIsSecureVisible(!isSecureVisible)}
              activeOpacity={0.7}
            >
              <Text style={styles.eyeIcon}>{isSecureVisible ? '👁️' : '🙈'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </TouchableWithoutFeedback>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 14,
    width: '100%'
  },
  label: {
    fontSize: 13,
    color: '#334155', // Charcoal grey label
    marginBottom: 6,
    fontWeight: '700',
    letterSpacing: 0.1
  },
  inputContainer: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: 'rgba(30, 58, 138, 0.25)', // Premium soft blue border
    borderRadius: 12,
    height: 48,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative'
  },
  inputFocused: {
    borderColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2
  },
  inputError: {
    borderColor: Colors.danger
  },
  prefixIcon: {
    fontSize: 16,
    marginRight: 10,
    color: '#64748B'
  },
  input: {
    color: '#1E293B',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    height: '100%',
    padding: 0
  },
  eyeBtn: {
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center'
  },
  eyeIcon: {
    fontSize: 16,
    color: '#64748B'
  },
  errorText: {
    color: Colors.danger,
    fontSize: 11,
    marginTop: 4,
    fontWeight: '600'
  }
});

export default CustomInput;
