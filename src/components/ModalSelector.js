import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Text, TextInput, Button, Divider, ActivityIndicator } from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import { COLORS, DARK_COLORS, SPACING, BORDER_RADIUS } from '../constants/theme';

const { width, height } = Dimensions.get('window');

const ModalSelector = ({
  visible,
  onClose,
  onSelect,
  title,
  data = [],
  loading,
  searchPlaceholder = 'Search...',
  displayKey,
  valueKey,
  renderItem,
  searchKeys = [],
  multiSelect = false,
  selectedItems = [],
}) => {
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const colors = isDarkMode ? DARK_COLORS : COLORS;

  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!visible) {
      setSearchQuery('');
    }
  }, [visible]);

  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) {
      return data || [];
    }

    const query = searchQuery.toLowerCase();
    const filtered = (data || []).filter(item => {
      // If searchKeys provided, search in those fields
      if (searchKeys.length > 0) {
        return searchKeys.some(key => {
          const value = item[key];
          return value && String(value).toLowerCase().includes(query);
        });
      }

      // Otherwise search in displayKey
      const displayValue = displayKey 
        ? item[displayKey] 
        : renderItem ? '' : String(item);
      return String(displayValue).toLowerCase().includes(query);
    });
    return filtered;
  }, [data, searchQuery, searchKeys, displayKey, renderItem]);

  const handleSelect = (item) => {
    const value = valueKey ? item[valueKey] : item;
    console.log('🔘 Item selected:', value, 'Current selected items:', selectedItems?.length || 0);
    onSelect(value, item);
    if (!multiSelect) {
      onClose();
    }
  };

  const isItemSelected = (item) => {
    if (!multiSelect || !selectedItems || selectedItems.length === 0) {
      return false;
    }
    const itemValue = valueKey ? item[valueKey] : item;
    const isSelected = selectedItems.some(selected => {
      const selectedValue = valueKey ? selected[valueKey] : selected;
      return selectedValue === itemValue;
    });
    return isSelected;
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContainer, { backgroundColor: colors.card }]}>
          {/* Header */}
          <View style={[styles.modalHeader, { backgroundColor: colors.primary }]}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <MaterialIcons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Search Input */}
          <View style={[styles.searchContainer, { backgroundColor: colors.card }]}>
            <TextInput
              mode="outlined"
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChangeText={setSearchQuery}
              style={styles.searchInput}
              left={<TextInput.Icon icon="magnify" />}
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect={false}
            />
          </View>

          {/* Content */}
          <View style={[styles.contentContainer, { backgroundColor: colors.card }]}>
            {loading ? (
              <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.loadingText, { color: colors.dark }]}>Loading...</Text>
              </View>
            ) : filteredData.length === 0 ? (
              <View style={styles.centerContainer}>
                <MaterialIcons name="inbox" size={64} color={colors.gray} />
                <Text style={[styles.emptyText, { color: colors.dark }]}>
                  {searchQuery ? 'No results found' : 'No data available'}
                </Text>
              </View>
            ) : (
              <ScrollView 
                style={styles.listContainer}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={true}
                nestedScrollEnabled={true}
              >
                {filteredData.map((item, index) => {
                  const isSelected = isItemSelected(item);
                  return (
                    <View key={index}>
                      <TouchableOpacity
                        style={[
                          styles.listItem,
                          { backgroundColor: isSelected ? colors.primary + '15' : colors.card }
                        ]}
                        onPress={() => handleSelect(item)}
                        activeOpacity={0.7}
                      >
                        {multiSelect && (
                          <View style={styles.checkboxContainer}>
                            <MaterialIcons 
                              name={isSelected ? "check-box" : "check-box-outline-blank"} 
                              size={24} 
                              color={isSelected ? colors.primary : colors.gray} 
                            />
                          </View>
                        )}
                        <View style={styles.itemContent}>
                          {renderItem ? (
                            renderItem(item)
                          ) : (
                            <Text style={[styles.itemText, { color: colors.dark }]}>
                              {displayKey ? item[displayKey] : String(item)}
                            </Text>
                          )}
                        </View>
                        {!multiSelect && (
                          <Button
                            mode="contained"
                            onPress={() => handleSelect(item)}
                            compact
                            style={styles.selectButton}
                          >
                            Select
                          </Button>
                        )}
                      </TouchableOpacity>
                      {index < filteredData.length - 1 && <Divider />}
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
          
          {/* Footer with Done button for multi-select */}
          {multiSelect && (
            <View style={[styles.footer, { backgroundColor: colors.card, borderTopColor: colors.gray + '30' }]}>
              <Button
                mode="contained"
                onPress={onClose}
                style={styles.doneButtonFooter}
                contentStyle={{ paddingVertical: 8 }}
                icon="check"
              >
                Done {selectedItems && selectedItems.length > 0 ? `(${selectedItems.length})` : ''}
              </Button>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: width * 0.9,
    height: height * 0.8,
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    flexDirection: 'column',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.md,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    flex: 1,
  },
  closeButton: {
    padding: SPACING.sm / 2,
  },
  checkboxContainer: {
    marginRight: SPACING.sm,
  },
  footer: {
    padding: SPACING.md,
    borderTopWidth: 1,
  },
  doneButtonFooter: {
    borderRadius: BORDER_RADIUS.md,
  },
  searchContainer: {
    padding: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  searchInput: {
    backgroundColor: 'transparent',
  },
  contentContainer: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  loadingText: {
    marginTop: SPACING.md,
    fontSize: 16,
  },
  emptyText: {
    marginTop: SPACING.md,
    fontSize: 16,
    textAlign: 'center',
  },
  listContainer: {
    
  },
  scrollContent: {
    paddingBottom: SPACING.xl,
    flexGrow: 1,
  },
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.md,
    minHeight: 60,
  },
  itemContent: {
    flex: 1,
    marginRight: SPACING.md,
  },
  itemText: {
    fontSize: 16,
  },
  selectButton: {
    minWidth: 80,
  },
});

export default ModalSelector;
