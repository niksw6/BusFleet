import { useState, useCallback } from 'react';

export const useConfirmation = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [confirmCallback, setConfirmCallback] = useState(null);

  const showConfirmation = useCallback((callback) => {
    setConfirmCallback(() => callback);
    setIsVisible(true);
  }, []);

  const handleConfirm = useCallback(() => {
    if (confirmCallback) {
      confirmCallback();
    }
    setIsVisible(false);
    setConfirmCallback(null);
  }, [confirmCallback]);

  const handleCancel = useCallback(() => {
    setIsVisible(false);
    setConfirmCallback(null);
  }, []);

  return {
    isVisible,
    showConfirmation,
    handleConfirm,
    handleCancel,
  };
};

export default useConfirmation;
