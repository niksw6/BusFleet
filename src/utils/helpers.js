export const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

export const validatePhone = (phone) => {
  const re = /^[0-9]{10}$/;
  return re.test(phone);
};

export const formatDate = (date) => {
  if (!date) return '';
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

export const formatTime = (date) => {
  if (!date) return '';
  const d = new Date(date);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

export const formatDateTime = (date) => {
  if (!date) return '';
  return `${formatDate(date)} ${formatTime(date)}`;
};

export const calculateDuration = (startTime, endTime) => {
  if (!startTime || !endTime) return 0;
  const start = new Date(startTime);
  const end = new Date(endTime);
  const diff = end - start;
  return Math.floor(diff / (1000 * 60)); // minutes
};

export const formatDuration = (minutes) => {
  if (!minutes) return '0 min';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins} min`;
  return `${hours}h ${mins}m`;
};

export const truncateText = (text, maxLength = 50) => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.substring(0, maxLength)}...`;
};

export const capitalizeFirstLetter = (string) => {
  if (!string) return '';
  return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
};

export const generateId = () => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

export const formatVehicleNumber = (value) => {
  if (!value) return '';
  
  // Remove all non-alphanumeric characters
  const cleaned = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  
  // Format: AA 00 AA 0000
  let formatted = '';
  
  // First 2 letters
  if (cleaned.length > 0) {
    formatted += cleaned.substring(0, 2).replace(/[0-9]/g, '');
  }
  
  // Add space and next 2 digits
  if (cleaned.length > 2) {
    const letters1 = cleaned.substring(0, 2).replace(/[0-9]/g, '');
    const restAfterFirst = cleaned.substring(letters1.length);
    const digits1 = restAfterFirst.substring(0, 2).replace(/[A-Z]/g, '');
    if (digits1.length > 0) {
      formatted += ' ' + digits1;
    }
  }
  
  // Add space and next 2 letters
  if (cleaned.length > 4) {
    const letters1 = cleaned.substring(0, 2).replace(/[0-9]/g, '');
    const restAfterFirst = cleaned.substring(letters1.length);
    const digits1 = restAfterFirst.substring(0, 2).replace(/[A-Z]/g, '');
    const restAfterDigits = restAfterFirst.substring(digits1.length);
    const letters2 = restAfterDigits.substring(0, 2).replace(/[0-9]/g, '');
    if (letters2.length > 0) {
      formatted += ' ' + letters2;
    }
  }
  
  // Add space and last 4 digits
  if (cleaned.length > 6) {
    const letters1 = cleaned.substring(0, 2).replace(/[0-9]/g, '');
    const restAfterFirst = cleaned.substring(letters1.length);
    const digits1 = restAfterFirst.substring(0, 2).replace(/[A-Z]/g, '');
    const restAfterDigits = restAfterFirst.substring(digits1.length);
    const letters2 = restAfterDigits.substring(0, 2).replace(/[0-9]/g, '');
    const restAfterLetters = restAfterDigits.substring(letters2.length);
    const digits2 = restAfterLetters.substring(0, 4).replace(/[A-Z]/g, '');
    if (digits2.length > 0) {
      formatted += ' ' + digits2;
    }
  }
  
  return formatted;
};

export const validateVehicleNumber = (value) => {
  if (!value) return false;
  // Regex: 2 letters, space, 2 digits, space, 2 letters, space, 4 digits
  const regex = /^[A-Z]{2} [0-9]{2} [A-Z]{2} [0-9]{4}$/;
  return regex.test(value);
};

export const getPriorityColor = (priority, isDark = false) => {
  const colors = {
    Low: isDark ? '#4CAF50' : '#28A745',
    Medium: isDark ? '#FFB300' : '#FFC107',
    High: isDark ? '#FF8C5A' : '#FF6B35',
    Critical: isDark ? '#F44336' : '#DC3545',
  };
  return colors[priority] || colors.Medium;
};

export const getStatusColor = (status, isDark = false) => {
  const colors = {
    // New API status codes
    'O': isDark ? '#FFB300' : '#FFC107', // Open
    'I': isDark ? '#29B6F6' : '#17A2B8', // In Progress
    'CM': isDark ? '#4CAF50' : '#28A745', // Completed
    'C': isDark ? '#4CAF50' : '#28A745', // Completed
    'D': isDark ? '#F44336' : '#DC3545', // Declined
    // Old status names (for backward compatibility)
    'Open': isDark ? '#FFB300' : '#FFC107',
    'Pending': isDark ? '#FFB300' : '#FFC107',
    'In Progress': isDark ? '#29B6F6' : '#17A2B8',
    'Completed': isDark ? '#4CAF50' : '#28A745',
    'Cancelled': isDark ? '#F44336' : '#DC3545',
    'Declined': isDark ? '#F44336' : '#DC3545',
  };
  return colors[status] || colors['O'];
};

export const getStatusName = (status) => {
  const statusNames = {
    'O': 'Open',
    'I': 'In Progress',
    'CM': 'Completed',
    'C': 'Completed',
    'D': 'Declined',
  };
  return statusNames[status] || status;
};

// Get color for complaint type (SAP-style)
export const getComplaintTypeColor = (type) => {
  if (!type) return '#0070F2'; // default blue
  const lowerType = type.toLowerCase();
  
  if (lowerType.includes('breakdown')) {
    return '#BB0000'; // Red - Critical
  } else if (lowerType.includes('preventive')) {
    return '#2B7D2B'; // Green - Preventive
  } else if (lowerType.includes('mechanical')) {
    return '#00689E'; // Teal - Mechanical
  } else {
    return '#0070F2'; // Blue - General/Complaint
  }
};

// Get badge configuration for complaint type
export const getComplaintTypeBadge = (type) => {
  if (!type) return { color: '#0070F2', icon: 'build', label: 'Incident' };
  const lowerType = type.toLowerCase();
  
  if (lowerType.includes('breakdown')) {
    return { color: '#BB0000', icon: 'warning', label: type };
  } else if (lowerType.includes('preventive')) {
    return { color: '#2B7D2B', icon: 'event', label: type };
  } else if (lowerType.includes('mechanical')) {
    return { color: '#00689E', icon: 'build', label: type };
  } else {
    return { color: '#0070F2', icon: 'report-problem', label: type };
  }
};

export const getJobTypeCode = (source) => {
  if (!source) return 'D';

  if (typeof source === 'string') {
    const normalized = source.trim().toUpperCase();
    if (normalized === 'B' || normalized === 'D') {
      return normalized;
    }

    return normalized.toLowerCase().includes('breakdown') ? 'B' : 'D';
  }

  const explicitType = source.JobType || source.FormType || source.Type;
  if (explicitType === 'B' || explicitType === 'D') {
    return explicitType;
  }

  const complaintType = source.ComplaintType || source.JobTypeName || source.TypeName || '';
  return String(complaintType).toLowerCase().includes('breakdown') ? 'B' : 'D';
};

export const formatJobCardDisplayNo = (jobCard) => {
  if (!jobCard) return '-';

  const primaryNo = jobCard.JobCardNo ?? jobCard.DocEntry;
  if (primaryNo === undefined || primaryNo === null || primaryNo === '') {
    return '-';
  }

  const jobNoString = String(primaryNo).trim();
  if (/^[BD][-\s]?\d+$/i.test(jobNoString)) {
    return jobNoString.toUpperCase().replace(/\s+/, '-');
  }

  const code = getJobTypeCode(jobCard);
  const baseNo = jobCard.DocEntry ?? jobCard.JobCardNo;
  return `${code}-${baseNo}`;
};
