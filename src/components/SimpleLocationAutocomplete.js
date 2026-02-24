import React from 'react';
import { TextInput } from 'react-native-paper';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING } from '../constants/theme';

const SimpleLocationAutocomplete = ({ 
  label, 
  value, 
  onLocationSelect, 
  placeholder, 
  error, 
  touched,
  onBlur 
}) => {
  return (
    <View>
      <TextInput
        label={label}
        mode="outlined"
        value={value}
        onChangeText={onLocationSelect}
        onBlur={onBlur}
        placeholder={placeholder}
        error={error && touched}
        style={styles.input}
      />
      {error && touched && (
        <Text style={styles.errorText}>{error}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  input: {
    marginBottom: SPACING.sm,
    backgroundColor: 'transparent',
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 12,
    marginBottom: SPACING.sm,
  },
});

export default SimpleLocationAutocomplete;
