export const normalizeNotificationItem = (item, index = 0) => {
  const rawType = String(item?.Type || item?.type || '').trim().toUpperCase();
  const normalizedType = ['WE', 'WER', 'LBWE'].includes(rawType) ? 'V' : rawType;
  const title = item?.Message || item?.message || item?.Title || item?.title || 'Notification';
  const incidentNo = [item?.Incident, item?.incident, item?.IncidentNo, item?.incidentNo, item?.ComplaintNo, item?.complaintNo]
    .map(value => String(value ?? '').trim())
    .find(value => value !== '' && value !== '0');
  const jobCardNo = [item?.JobCard, item?.jobCard, item?.JobCardNo, item?.jobCardNo, item?.JobCardDocEntry, item?.jobCardDocEntry, item?.JobCardEntry, item?.jobCardEntry]
    .map(value => String(value ?? '').trim())
    .find(value => value !== '' && value !== '0');
  const workEntryNo = [item?.WorkEntry, item?.workEntry, item?.WorkEntryNo, item?.workEntryNo, item?.WorkEntryDocEntry, item?.workEntryDocEntry]
    .map(value => String(value ?? '').trim())
    .find(value => value !== '' && value !== '0');

  return {
    ...item,
    creatorName: item?.CreatedBy || item?.CreatorName || item?.UserName || item?.AssignBy || item?.SprvsrNm || item?.DriverName || '',
    priority: item?.Priority || item?.Severity || item?.Significance || '',
    busNo: item?.BusNo || item?.Vehicle || item?.BusCode || item?.BusRegistrationNo || item?.RegNo || '',
    detailDocEntry: item?.DocEntry || item?.ReferenceDocEntry || item?.RefDocEntry || item?.JobCardDocEntry || item?.ComplaintNo || incidentNo || jobCardNo || workEntryNo || null,
    significance: item?.Significance || item?.Severity || item?.Priority || item?.Type || '',
    incidentNo,
    jobCardNo,
    workEntryNo,
    jobCardDocEntry: jobCardNo || item?.JobCardDocEntry || item?.jobCardDocEntry || item?.JobCardEntry || item?.jobCardEntry || item?.JobCardNo || item?.jobCardNo || item?.JobcardNo || '',
    workEntryDocEntry: workEntryNo || item?.WorkEntryDocEntry || item?.workEntryDocEntry || item?.WorkEntryNo || item?.workEntryNo || item?.ReferenceDocEntry || item?.RefDocEntry || '',
    id: item?.id || item?.Code || item?.DocEntry || `notification-${index}`,
    code: item?.Code || item?.id || item?.DocEntry || `notification-${index}`,
    title,
    message: item?.Message || item?.message || '',
    read: String(item?.Read || '').trim().toUpperCase() === 'Y',
    type: normalizedType,
    timestamp: item?.Date || item?.timestamp || null,
    docEntry: incidentNo || jobCardNo || workEntryNo || item?.DocEntry || item?.ReferenceDocEntry || item?.RefDocEntry || item?.JobCardDocEntry || item?.ComplaintNo,
  };
};

export const ensureUniqueNotificationKeys = (items = []) => {
  const seen = new Map();
  return (Array.isArray(items) ? items : []).map((item, index) => {
    const baseKey = [
      item?.id,
      item?.code,
      item?.type,
      item?.docEntry,
      item?.detailDocEntry,
      item?.timestamp,
      item?.title,
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join('|') || `notification-${index}`;

    const occurrence = seen.get(baseKey) || 0;
    seen.set(baseKey, occurrence + 1);

    return {
      ...item,
      _listKey: occurrence === 0 ? baseKey : `${baseKey}#${occurrence + 1}`,
    };
  });
};
