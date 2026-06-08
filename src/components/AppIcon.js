import React from 'react';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

const resolveName = (name, source) => {
  if (typeof name === 'string' && name.trim()) return name;
  if (typeof source === 'string' && source.trim()) return source;
  if (source && typeof source === 'object' && typeof source.name === 'string') return source.name;
  return '';
};

const AppIcon = ({
  name,
  source,
  color = '#222',
  size = 20,
  style,
  testID,
  allowFontScaling,
  ...rest
}) => {
  const iconName = resolveName(name, source);

  return (
    <MaterialIcons
      {...rest}
      testID={testID}
      allowFontScaling={allowFontScaling}
      name={iconName || 'help'}
      color={color}
      size={size}
      style={style}
    />
  );
};

AppIcon.loadFont = async () => {
  await MaterialIcons.loadFont();
};
AppIcon.getRawGlyphMap = () => MaterialIcons.getRawGlyphMap?.() || {};
AppIcon.getFontFamily = () => MaterialIcons.getFontFamily?.() || 'System';
AppIcon.hasIcon = (name) => MaterialIcons.hasIcon?.(name) ?? true;
AppIcon.getImageSource = (name, size = 24, color = '#000') => MaterialIcons.getImageSource?.(name, size, color);
AppIcon.getImageSourceSync = (name, size = 24, color = '#000') => MaterialIcons.getImageSourceSync?.(name, size, color);
AppIcon.Button = AppIcon;

export default AppIcon;
