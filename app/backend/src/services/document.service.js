                                                                                                                              
export const REQUIRED_DOCS = ['Transfer Certificate', 'Birth Certificate', 'Application Form'];
export const DOC_TYPES = [...REQUIRED_DOCS, 'Community Certificate', 'Aadhaar Card'];

                                                                                            
export class DocumentService {
  async list(ctx) { throw new Error('DocumentService.list is not implemented'); }
  async upload(ctx) { throw new Error('DocumentService.upload is not implemented'); }
  async students(ctx) { throw new Error('DocumentService.students is not implemented'); }
  async progress(ctx) { throw new Error('DocumentService.progress is not implemented'); }
  async replace(ctx) { throw new Error('DocumentService.replace is not implemented'); }
  async file(ctx) { throw new Error('DocumentService.file is not implemented'); }
  async review(ctx) { throw new Error('DocumentService.review is not implemented'); }
}
