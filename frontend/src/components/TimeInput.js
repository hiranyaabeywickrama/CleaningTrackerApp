import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Modal,
  ScrollView,
  Platform
} from 'react-native';
import { Colors } from '../theme/colors';

// Helper: Parse 12h/24h inputs to a 24-hour "HH:MM" string
export const parseTimeTo24h = (input) => {
  if (!input) return null;
  const clean = input.trim().toUpperCase();
  
  // Try 12-hour format with AM/PM (e.g. "9:00 AM", "02:30 PM", "12:00 PM")
  const match12 = clean.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (match12) {
    let hours = parseInt(match12[1], 10);
    const minutes = parseInt(match12[2], 10);
    const period = match12[3];
    
    if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) return null;
    
    if (period === 'PM' && hours !== 12) {
      hours += 12;
    } else if (period === 'AM' && hours === 12) {
      hours = 0;
    }
    
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  // Try 12-hour format without minutes but with AM/PM (e.g. "9 AM", "12 PM")
  const match12NoMin = clean.match(/^(\d{1,2})\s*(AM|PM)$/);
  if (match12NoMin) {
    let hours = parseInt(match12NoMin[1], 10);
    const period = match12NoMin[2];
    
    if (hours < 1 || hours > 12) return null;
    
    if (period === 'PM' && hours !== 12) {
      hours += 12;
    } else if (period === 'AM' && hours === 12) {
      hours = 0;
    }
    
    return `${String(hours).padStart(2, '0')}:00`;
  }

  // Try 24-hour format HH:MM (e.g. "09:00", "14:30")
  const match24 = clean.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const hours = parseInt(match24[1], 10);
    const minutes = parseInt(match24[2], 10);
    
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  // Try raw hour digit: e.g. "9" -> "09:00", "14" -> "14:00"
  const matchRawHour = clean.match(/^(\d{1,2})$/);
  if (matchRawHour) {
    const hours = parseInt(matchRawHour[1], 10);
    if (hours >= 0 && hours <= 23) {
      return `${String(hours).padStart(2, '0')}:00`;
    }
  }

  // Try digits without colon: e.g. "0900" -> "09:00", "1430" -> "14:30"
  const matchRawDigits = clean.match(/^(\d{3,4})$/);
  if (matchRawDigits) {
    const str = matchRawDigits[1];
    let hours, minutes;
    if (str.length === 3) {
      hours = parseInt(str.slice(0, 1), 10);
      minutes = parseInt(str.slice(1), 10);
    } else {
      hours = parseInt(str.slice(0, 2), 10);
      minutes = parseInt(str.slice(2), 10);
    }
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
  }

  return null;
};

// Convert "HH:MM" 24h format to 12h display string (e.g. "09:00" -> "9:00 AM")
export const format24hTo12h = (time24) => {
  if (!time24) return '';
  const [hStr, mStr] = time24.split(':');
  let h = parseInt(hStr, 10);
  const period = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${mStr} ${period}`;
};

const TimeInput = ({
  label,
  value,
  onChangeText,
  placeholder = 'Example: 9:00 AM or 2:30 PM',
  required = false,
  icon = '🕒',
  ...props
}) => {
  const [inputValue, setInputValue] = useState('');
  const [errorText, setErrorText] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showPicker, setShowPicker] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  // Time picker state variables
  const [pickerFormat, setPickerFormat] = useState('12'); // '12' or '24'
  const [selectedHour, setSelectedHour] = useState('09');
  const [selectedMinute, setSelectedMinute] = useState('00');
  const [selectedPeriod, setSelectedPeriod] = useState('AM'); // 'AM' or 'PM'

  const inputRef = useRef(null);
  const prevTextRef = useRef('');

  // Sync external 24h value with internal input display
  useEffect(() => {
    if (value) {
      const parsed24 = parseTimeTo24h(value);
      if (parsed24) {
        // Always display in 12-hour format in the input field
        setInputValue(format24hTo12h(parsed24));
        setErrorText('');
      } else {
        setInputValue(value);
      }
    } else {
      setInputValue('');
    }
  }, [value]);

  // Generate suggestions based on what is typed
  const updateSuggestions = (text) => {
    if (!text || text.trim().length === 0) {
      setSuggestions([]);
      return;
    }

    const trimmed = text.trim();
    const list = [];

    // Case 1: Simple single or double digit hour typed (e.g., "9" or "14")
    if (/^\d{1,2}$/.test(trimmed)) {
      const val = parseInt(trimmed, 10);
      if (val >= 1 && val <= 12) {
        list.push(`${val}:00 AM`);
        list.push(`${val}:00 PM`);
      } else if (val > 12 && val <= 23) {
        list.push(`${val - 12}:00 PM`);
      }
    } else {
      // Case 2: Standard parse match
      const parsed24 = parseTimeTo24h(trimmed);
      if (parsed24) {
        const format12 = format24hTo12h(parsed24);
        if (format12 && format12 !== trimmed) {
          list.push(format12);
        }
      }
    }

    // Filter out duplicates and the exact value already typed
    const uniqueList = Array.from(new Set(list)).filter(
      (item) => item.toUpperCase() !== trimmed.toUpperCase()
    );
    setSuggestions(uniqueList.slice(0, 3));
  };

  const handleTextChange = (text) => {
    // Prevent typing invalid characters
    let cleaned = text.replace(/[^0-9a-zA-Z:\s]/g, '');

    const isAdding = cleaned.length > prevTextRef.current.length;
    prevTextRef.current = cleaned;

    // Auto-formatting: If typing digits without colon, format e.g. "1230" to "12:30"
    if (isAdding && /^\d{3,4}$/.test(cleaned) && !cleaned.includes(':')) {
      if (cleaned.length === 3) {
        cleaned = cleaned.slice(0, 1) + ':' + cleaned.slice(1);
      } else {
        cleaned = cleaned.slice(0, 2) + ':' + cleaned.slice(2);
      }
    } else if (isAdding && /^\d{2}$/.test(cleaned)) {
      // Auto-append colon after typing two digits, e.g. "09" -> "09:"
      cleaned = cleaned + ':';
    }

    // Limit length to typical "12:00 PM" (8 chars)
    if (cleaned.length > 8) {
      cleaned = cleaned.slice(0, 8);
    }

    setInputValue(cleaned);
    updateSuggestions(cleaned);

    // Validate on the fly: check if it parses to a valid 24h
    const parsed = parseTimeTo24h(cleaned);
    if (parsed) {
      setErrorText('');
      onChangeText(parsed); // Send 24h format to parent
    } else {
      // If incomplete or invalid, report empty value to parent so it fails required check
      onChangeText('');
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    setSuggestions([]);

    const trimmed = inputValue.trim();
    if (!trimmed) {
      if (required) {
        setErrorText('Time is required');
      } else {
        setErrorText('');
      }
      onChangeText('');
      return;
    }

    const parsed24 = parseTimeTo24h(trimmed);
    if (parsed24) {
      setErrorText('');
      // Always display in 12-hour format in the input field
      setInputValue(format24hTo12h(parsed24));
      onChangeText(parsed24);
    } else {
      setErrorText('Please enter a valid time');
      onChangeText('');
    }
  };

  const handleSelectSuggestion = (suggestedTime) => {
    setInputValue(suggestedTime);
    setSuggestions([]);
    const parsed24 = parseTimeTo24h(suggestedTime);
    if (parsed24) {
      setErrorText('');
      onChangeText(parsed24);
    }
  };

  // Time picker modal helpers
  const handleOpenPicker = () => {
    // Parse current value to pre-fill the picker
    const current24 = parseTimeTo24h(inputValue) || '09:00';
    const [hStr, mStr] = current24.split(':');
    const h = parseInt(hStr, 10);
    
    // Set matching hour & minutes
    setSelectedMinute(mStr);
    
    const isPM = h >= 12;
    setSelectedPeriod(isPM ? 'PM' : 'AM');
    const h12 = h % 12 || 12;
    setSelectedHour(String(h12).padStart(2, '0'));
    
    setShowPicker(true);
  };

  const handleFormatChange = (format) => {
    setPickerFormat(format);
    
    // Convert hour state on format swap
    let hr = parseInt(selectedHour, 10);
    if (format === '24') {
      // 12h -> 24h
      if (selectedPeriod === 'PM' && hr !== 12) {
        hr += 12;
      } else if (selectedPeriod === 'AM' && hr === 12) {
        hr = 0;
      }
      setSelectedHour(String(hr).padStart(2, '0'));
    } else {
      // 24h -> 12h
      const period = hr >= 12 ? 'PM' : 'AM';
      setSelectedPeriod(period);
      const hr12 = hr % 12 || 12;
      setSelectedHour(String(hr12).padStart(2, '0'));
    }
  };

  const handleConfirmPicker = () => {
    let hr = parseInt(selectedHour, 10);
    if (selectedPeriod === 'PM' && hr !== 12) {
      hr += 12;
    } else if (selectedPeriod === 'AM' && hr === 12) {
      hr = 0;
    }
    
    const parsed24 = `${String(hr).padStart(2, '0')}:${selectedMinute}`;
    setErrorText('');
    setInputValue(format24hTo12h(parsed24));
    
    onChangeText(parsed24);
    setShowPicker(false);
  };

  // Generate hour/minute button lists
  const hours12 = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
  const hours24 = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  const minutesList = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

  return (
    <View style={styles.container}>
      {label && (
        <Text style={styles.label}>
          {label} {required && <Text style={{ color: Colors.danger }}>*</Text>}
        </Text>
      )}

      <View
        style={[
          styles.inputContainer,
          isFocused && styles.inputFocused,
          errorText ? styles.inputError : null
        ]}
      >
        <Text style={styles.prefixIcon}>{icon}</Text>

        <TextInput
          ref={inputRef}
          style={styles.input}
          value={inputValue}
          onChangeText={handleTextChange}
          onFocus={() => setIsFocused(true)}
          onBlur={handleBlur}
          placeholder={placeholder}
          placeholderTextColor="#94A3B8"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect={false}
          keyboardType="default"
          {...props}
        />

        <TouchableOpacity
          style={styles.pickerTrigger}
          onPress={handleOpenPicker}
          activeOpacity={0.7}
        >
          <Text style={styles.pickerTriggerIcon}>📅</Text>
        </TouchableOpacity>
      </View>

      {/* Suggestion Chips */}
      {suggestions.length > 0 && (
        <View style={styles.suggestionsContainer}>
          <Text style={styles.suggestionLabel}>Suggested:</Text>
          {suggestions.map((time) => (
            <TouchableOpacity
              key={time}
              style={styles.suggestionChip}
              onPress={() => handleSelectSuggestion(time)}
              activeOpacity={0.7}
            >
              <Text style={styles.suggestionChipText}>{time}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Helper text / formats */}
      {!errorText && (
        <Text style={styles.helperText}>
          Accepted formats: 9:00 AM, 2:30 PM
        </Text>
      )}

      {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

      {/* Custom Picker Modal */}
      <Modal
        visible={showPicker}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowPicker(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowPicker(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Select Start Time</Text>

                <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
                  {/* Hours Selection */}
                  <Text style={styles.sectionHeader}>Hour</Text>
                  <View style={styles.gridContainer}>
                    {hours12.map((h) => (
                      <TouchableOpacity
                        key={h}
                        style={[
                          styles.gridItem,
                          selectedHour === h && styles.gridItemActive
                        ]}
                        onPress={() => setSelectedHour(h)}
                      >
                        <Text
                          style={[
                            styles.gridItemText,
                            selectedHour === h && styles.gridItemTextActive
                          ]}
                        >
                          {h}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Minutes Selection */}
                  <Text style={styles.sectionHeader}>Minute</Text>
                  <View style={styles.gridContainer}>
                    {minutesList.map((m) => (
                      <TouchableOpacity
                        key={m}
                        style={[
                          styles.gridItem,
                          selectedMinute === m && styles.gridItemActive
                        ]}
                        onPress={() => setSelectedMinute(m)}
                      >
                        <Text
                          style={[
                            styles.gridItemText,
                            selectedMinute === m && styles.gridItemTextActive
                          ]}
                        >
                          {m}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Period Selection (12-hour only) */}
                  {pickerFormat === '12' && (
                    <View style={styles.periodRow}>
                      <TouchableOpacity
                        style={[
                          styles.periodButton,
                          selectedPeriod === 'AM' && styles.periodButtonActive
                        ]}
                        onPress={() => setSelectedPeriod('AM')}
                      >
                        <Text
                          style={[
                            styles.periodButtonText,
                            selectedPeriod === 'AM' && styles.periodButtonTextActive
                          ]}
                        >
                          AM
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.periodButton,
                          selectedPeriod === 'PM' && styles.periodButtonActive
                        ]}
                        onPress={() => setSelectedPeriod('PM')}
                      >
                        <Text
                          style={[
                            styles.periodButtonText,
                            selectedPeriod === 'PM' && styles.periodButtonTextActive
                          ]}
                        >
                          PM
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </ScrollView>

                {/* Footer Buttons */}
                <View style={styles.modalFooter}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => setShowPicker(false)}
                  >
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.confirmBtn}
                    onPress={handleConfirmPicker}
                  >
                    <Text style={styles.confirmBtnText}>Confirm</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
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
    color: '#334155',
    marginBottom: 6,
    fontWeight: '700',
    letterSpacing: 0.1
  },
  inputContainer: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: 'rgba(30, 58, 138, 0.25)',
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
  pickerTrigger: {
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%'
  },
  pickerTriggerIcon: {
    fontSize: 16
  },
  helperText: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 4,
    fontWeight: '500'
  },
  errorText: {
    color: Colors.danger,
    fontSize: 11,
    marginTop: 4,
    fontWeight: '600'
  },
  // Suggestions UI
  suggestionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    flexWrap: 'wrap'
  },
  suggestionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginRight: 6
  },
  suggestionChip: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginRight: 6,
    marginVertical: 2
  },
  suggestionChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.secondary
  },
  // Picker Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  modalContent: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 14,
    textAlign: 'center'
  },
  formatToggleRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
    marginBottom: 16
  },
  formatTabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8
  },
  formatTabButtonActive: {
    backgroundColor: Colors.primary
  },
  formatTabText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '700'
  },
  formatTabTextActive: {
    color: '#FFFFFF'
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
    marginBottom: 8,
    marginTop: 6
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4
  },
  gridItem: {
    width: '25%',
    padding: 4,
    alignItems: 'center'
  },
  gridItemActive: {
    backgroundColor: Colors.primaryMuted,
    borderRadius: 8
  },
  gridItemText: {
    fontSize: 13,
    color: '#1E293B',
    fontWeight: '750',
    paddingVertical: 6,
    width: '100%',
    textAlign: 'center',
    borderColor: '#E2E8F0',
    borderWidth: 1,
    borderRadius: 8
  },
  gridItemTextActive: {
    color: Colors.primary,
    borderColor: Colors.primary,
    borderWidth: 1.2
  },
  periodRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginVertical: 14,
    gap: 12
  },
  periodButton: {
    flex: 1,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    alignItems: 'center'
  },
  periodButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary
  },
  periodButtonText: {
    fontSize: 13,
    color: '#1E293B',
    fontWeight: '700'
  },
  periodButtonTextActive: {
    color: '#FFFFFF'
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 18,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 14
  },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#F1F5F9'
  },
  cancelBtnText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '700'
  },
  confirmBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: Colors.primary
  },
  confirmBtnText: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '700'
  }
});

export default TimeInput;
