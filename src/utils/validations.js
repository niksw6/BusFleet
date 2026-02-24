import * as Yup from 'yup';

export const loginValidationSchema = Yup.object().shape({
  company: Yup.string().required('Company is required'),
  username: Yup.string().required('Username is required').min(3, 'Username must be at least 3 characters'),
  password: Yup.string().required('Password is required').min(4, 'Password must be at least 4 characters'),
});

export const driverComplaintValidationSchema = Yup.object().shape({
  vehicleNumber: Yup.string().required('Vehicle number is required'),
  driverName: Yup.string().required('Driver name is required'),
  driverCode: Yup.string().required('Driver code is required'),
  complaintDate: Yup.date().required('Complaint date is required'),
  complaintTime: Yup.string().required('Complaint time is required'),
  odometer: Yup.number().required('Odometer reading is required').positive('Must be a positive number'),
  jobType: Yup.string().required('Job type is required'),
  depot: Yup.string().required('Depot is required'),
  supervisorCode: Yup.string().required('Supervisor code is required'),
  supervisorName: Yup.string().required('Supervisor name is required'),
  priority: Yup.string().required('Priority is required'),
  description: Yup.string().required('Description is required').min(10, 'Description must be at least 10 characters'),
  faults: Yup.array().of(
    Yup.object().shape({
      faultType: Yup.string().required('Fault type is required'),
      faultDescription: Yup.string().required('Fault description is required'),
    })
  ).min(1, 'At least one fault is required'),
});

export const lineBreakdownValidationSchema = Yup.object().shape({
  vehicleNumber: Yup.string()
    .required('Vehicle number is required')
    .matches(/^[A-Z]{2} [0-9]{2} [A-Z]{2} [0-9]{4}$/, 'Invalid format. Use: AA 00 AA 0000'),
  routeNumber: Yup.string().required('Route number is required'),
  breakdownLocation: Yup.string().required('Breakdown location is required'),
  breakdownDate: Yup.date().required('Breakdown date is required'),
  breakdownTime: Yup.string().required('Breakdown time is required'),
  priority: Yup.string().required('Priority is required'),
  description: Yup.string().required('Description is required').min(10, 'Description must be at least 10 characters'),
  faults: Yup.array().of(
    Yup.object().shape({
      faultType: Yup.string().required('Fault type is required'),
      faultDescription: Yup.string().required('Fault description is required'),
    })
  ).min(1, 'At least one fault is required'),
});

export const fuelLogValidationSchema = Yup.object().shape({
  vehicleNumber: Yup.string()
    .required('Vehicle number is required')
    .matches(/^[A-Z]{2} [0-9]{2} [A-Z]{2} [0-9]{4}$/, 'Invalid format. Use: AA 00 AA 0000'),
  odometer: Yup.number().required('Odometer reading is required').positive('Must be a positive number'),
  fuelQuantity: Yup.number().required('Fuel quantity is required').positive('Must be a positive number'),
  fuelType: Yup.string().required('Fuel type is required'),
  fuelDate: Yup.date().required('Fuel date is required'),
  fuelTime: Yup.string().required('Fuel time is required'),
  fuelStation: Yup.string().required('Fuel station is required'),
  cost: Yup.number().required('Cost is required').positive('Must be a positive number'),
});

export const scheduleValidationSchema = Yup.object().shape({
  vehicleNumber: Yup.string()
    .required('Vehicle number is required')
    .matches(/^[A-Z]{2} [0-9]{2} [A-Z]{2} [0-9]{4}$/, 'Invalid format. Use: AA 00 AA 0000'),
  serviceType: Yup.string().required('Service type is required'),
  scheduleType: Yup.string().required('Schedule type is required'),
  intervalKM: Yup.number().when('scheduleType', {
    is: 'KM',
    then: (schema) => schema.required('Interval KM is required').positive('Must be a positive number'),
    otherwise: (schema) => schema.nullable(),
  }),
  intervalDays: Yup.number().when('scheduleType', {
    is: 'Days',
    then: (schema) => schema.required('Interval days is required').positive('Must be a positive number'),
    otherwise: (schema) => schema.nullable(),
  }),
  nextServiceDate: Yup.date().required('Next service date is required'),
  notes: Yup.string(),
});
