                                                           
import { AuthServiceImpl } from './impl/auth.service.impl.js';
import { DashboardServiceImpl } from './impl/dashboard.service.impl.js';
import { StudentServiceImpl } from './impl/student.service.impl.js';
import { VerificationServiceImpl } from './impl/verification.service.impl.js';
import { VacancyServiceImpl } from './impl/vacancy.service.impl.js';
import { SelectionServiceImpl } from './impl/selection.service.impl.js';
import { TcServiceImpl } from './impl/tc.service.impl.js';
import { ImportServiceImpl } from './impl/import.service.impl.js';
import { LogServiceImpl } from './impl/log.service.impl.js';

export const authService = new AuthServiceImpl();
export const dashboardService = new DashboardServiceImpl();
export const studentService = new StudentServiceImpl();
export const verificationService = new VerificationServiceImpl();
export const vacancyService = new VacancyServiceImpl();
export const selectionService = new SelectionServiceImpl();
export const tcService = new TcServiceImpl();
export const importService = new ImportServiceImpl();
export const logService = new LogServiceImpl();
import { DocumentServiceImpl } from './impl/document.service.impl.js';
export const documentService = new DocumentServiceImpl();
import { ExportServiceImpl } from './impl/export.service.impl.js';
export const exportService = new ExportServiceImpl();
