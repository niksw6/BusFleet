import { useSelector } from 'react-redux';
import { COLORS, DARK_COLORS } from '../../constants/theme';

export const useTheme = () => {
  const isDarkMode = useSelector(state => state.theme.isDarkMode);
  const colors = isDarkMode ? DARK_COLORS : COLORS;

  return {
    isDarkMode,
    colors,
  };
};

export default useTheme;
