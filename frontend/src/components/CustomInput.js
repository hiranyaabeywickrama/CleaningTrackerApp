import React, { useState, useRef } from 'react';
import { View, TextInput, Text, StyleSheet, TouchableOpacity, TouchableWithoutFeedback, Modal, FlatList, Platform } from 'react-native';
import { Colors } from '../theme/colors';

const COUNTRIES = [
  { code: '+94', flag: '🇱🇰', name: 'Sri Lanka' },
  { code: '+1', flag: '🇺🇸', name: 'United States' },
  { code: '+44', flag: '🇬🇧', name: 'United Kingdom' },
  { code: '+61', flag: '🇦🇺', name: 'Australia' },
  { code: '+91', flag: '🇮🇳', name: 'India' },
  { code: '+65', flag: '🇸🇬', name: 'Singapore' },
  { code: '+971', flag: '🇦🇪', name: 'UAE' },
  { code: '+64', flag: '🇳🇿', name: 'New Zealand' },
];

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
  isPhoneInput = false,
  countryCode = '+94',
  onCountryCodeChange,
  onPress,
  ...props
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [isSecureVisible, setIsSecureVisible] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef(null);

  const shouldBeSecure = secureTextEntry && !isSecureVisible;
  const selectedCountry = COUNTRIES.find((c) => c.code === countryCode) || COUNTRIES[0];

  const ContainerComponent = onPress ? TouchableOpacity : TouchableWithoutFeedback;
  const containerPressHandler = onPress ? onPress : () => inputRef.current?.focus();

  return (
    <View style={styles.container}>
      {label ? (
        <Text style={styles.label}>
          {label} {required ? <Text style={{ color: Colors.danger }}>*</Text> : null}
        </Text>
      ) : null}
      
      <ContainerComponent onPress={containerPressHandler} {...(onPress ? { activeOpacity: 0.7 } : {})}>
        <View
          pointerEvents={onPress ? "none" : "auto"}
          style={[
            styles.inputContainer,
            isFocused && styles.inputFocused,
            error ? styles.inputError : null
          ]}
        >
          {isPhoneInput ? (
            <TouchableOpacity
              style={styles.countryPicker}
              onPress={() => setShowDropdown(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.countryPickerText}>{selectedCountry.flag} {selectedCountry.code}</Text>
              <Text style={styles.dropdownArrow}>▼</Text>
            </TouchableOpacity>
          ) : icon ? (
            <Text style={styles.prefixIcon}>{icon}</Text>
          ) : null}
          
          {onPress ? (
            <Text
              style={[
                styles.input,
                !value ? { color: '#94A3B8' } : null,
                { textAlignVertical: 'center', includeFontPadding: false }
              ]}
              numberOfLines={1}
            >
              {value || placeholder}
            </Text>
          ) : (
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
              onFocus={(e) => {
                setIsFocused(true);
                if (props.onFocus) props.onFocus(e);
              }}
              onBlur={(e) => {
                setIsFocused(false);
                if (props.onBlur) props.onBlur(e);
              }}
              {...props}
            />
          )}

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
      </ContainerComponent>
      
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {/* Country Selection Modal */}
      {isPhoneInput && (
        <Modal
          visible={showDropdown}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowDropdown(false)}
        >
          <TouchableWithoutFeedback onPress={() => setShowDropdown(false)}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback>
                <View style={styles.dropdownModal}>
                  <Text style={styles.dropdownTitle}>Select Country Code</Text>
                  <FlatList
                    data={COUNTRIES}
                    keyExtractor={(item) => item.code}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={styles.dropdownItem}
                        onPress={() => {
                          if (onCountryCodeChange) {
                            onCountryCodeChange(item.code);
                          }
                          setShowDropdown(false);
                        }}
                      >
                        <Text style={styles.dropdownItemFlag}>{item.flag}</Text>
                        <Text style={styles.dropdownItemName}>{item.name}</Text>
                        <Text style={styles.dropdownItemCode}>{item.code}</Text>
                      </TouchableOpacity>
                    )}
                  />
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}
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
  },
  // Country Picker styling
  countryPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
    borderRightWidth: 1.2,
    borderRightColor: '#E2E8F0',
    paddingRight: 10,
    height: '100%'
  },
  countryPickerText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#1E293B'
  },
  dropdownArrow: {
    fontSize: 8,
    color: '#64748B',
    marginLeft: 6
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)', // Glassmorphic translucent blur overlay
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  dropdownModal: {
    width: '100%',
    maxWidth: 280,
    maxHeight: 350,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8
  },
  dropdownTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 12,
    textAlign: 'center'
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1.2,
    borderBottomColor: '#F1F5F9'
  },
  dropdownItemFlag: {
    fontSize: 18,
    marginRight: 10
  },
  dropdownItemName: {
    fontSize: 13.5,
    color: '#1E293B',
    fontWeight: '600',
    flex: 1
  },
  dropdownItemCode: {
    fontSize: 13.5,
    color: '#64748B',
    fontWeight: '800'
  }
});

export default CustomInput;
