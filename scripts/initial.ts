import { PDFDocument, PDFName } from 'pdf-lib';

const pdf = await PDFDocument.load(await Bun.file('./fixtures/blank-form.pdf').arrayBuffer(), { ignoreEncryption: true });
const acro = pdf.catalog.lookup(PDFName.of('AcroForm'));

console.log('pages:    ', pdf.getPageCount());
console.log('AcroForm: ', acro ? 'yes' : 'no');
console.log('fields:   ', pdf.getForm().getFields().length);