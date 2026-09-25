import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

// Invoice Templates only ever supply the *default* Terms & Conditions text
// copied into a new invoice — this is the server-side mirror of what used
// to live only in frontend/lib/config/invoice-templates.ts. It's the
// factory-reset reference for FACTORY_DEFAULT_IDS below; the DB row is
// always the live, editable source of truth otherwise.
const FACTORY_DEFAULTS: Record<string, { label: string; description: string; title: string; policies: string[]; closing: string }> = {
  standard_local: {
    label: 'Standard Local',
    description: 'Standard local warranty terms',
    title: 'Standard Local',
    policies: [
      '1- One Year Standard Manufacturer Warranty.',
      '2- Any damages due to abusing, breakage, electrical shocks, tampering into the warranty stickers or components shall void the warranty.',
      '3- All warranties are relevant to Manufacturers / Distributors under their prevailing warranty policy.',
      '4- Handling of warranty may take from next day to 90 days, depending on the availability of the affected hardware / component at the time of claiming the warranty.',
      '5- WARRANTY IS NON-TRANSFERABLE.',
    ],
    closing: '',
  },
  standard_international: {
    label: 'Standard International',
    description: 'Standard international (HP) warranty terms',
    title: 'Standard International',
    policies: [
      '1- HP Standard International Manufacturer Warranty.',
      '2- Any damages due to abusing, breakage, electrical shocks, tampering into the warranty stickers or components shall void the warranty.',
      '3- All warranties are relevant to Manufacturers / Distributors under their prevailing warranty policy.',
      '4- Handling of warranty may take from next day to 90 days, depending on the availability of the affected hardware / component at the time of claiming the warranty.',
      '5- WARRANTY IS NON-TRANSFERABLE.',
    ],
    closing: '',
  },
  standard_toners: {
    label: 'Standard Toners',
    description: 'Standard toner warranty terms',
    title: 'Standard Toners',
    policies: [
      '1- HP Standard Manufacturer warranty for 03 months or 40% usage whichever is earlier from invoice date for toner.',
      '2- Any damages due to abusing, breakage, electrical shocks, tampering into the warranty stickers or components shall void the warranty.',
      '3- All warranties are relevant to Manufacturers / Distributors under their prevailing warranty policy.',
      '4- Handling of warranty may take from next day to 90 days, depending on the availability of the affected hardware / component at the time of claiming the warranty.',
      '5- WARRANTY IS NON-TRANSFERABLE.',
    ],
    closing: '',
  },
};

const FACTORY_DEFAULT_IDS = Object.keys(FACTORY_DEFAULTS);

export interface TemplateFootnotePayload {
  label?: string;
  description?: string;
  footnote?: { title?: string; policies?: string[]; closing?: string };
}

@Injectable()
export class InvoiceTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  private toFrontend(row: any) {
    return {
      id: row.id,
      label: row.label,
      description: row.description || '',
      footnote: {
        title: row.title || '',
        policies: Array.isArray(row.policies) ? row.policies : [],
        closing: row.closing || '',
      },
    };
  }

  async findAll() {
    const rows = await this.prisma.invoiceTemplate.findMany({ orderBy: { createdAt: 'asc' } });
    return rows.map((r) => this.toFrontend(r));
  }

  async findOneOrThrow(id: string) {
    const row = await this.prisma.invoiceTemplate.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`Invoice template "${id}" not found`);
    return this.toFrontend(row);
  }

  async create(data: TemplateFootnotePayload & { id?: string }) {
    const id = data.id?.trim() || `template_${Date.now()}`;
    const row = await this.prisma.invoiceTemplate.create({
      data: {
        id,
        label: data.label?.trim() || 'Untitled Template',
        description: data.description || '',
        title: data.footnote?.title || 'Terms & Conditions',
        policies: data.footnote?.policies?.length ? data.footnote.policies : [''],
        closing: data.footnote?.closing || '',
      },
    });
    return this.toFrontend(row);
  }

  async update(id: string, data: TemplateFootnotePayload) {
    await this.findOneOrThrow(id);
    const row = await this.prisma.invoiceTemplate.update({
      where: { id },
      data: {
        ...(data.label !== undefined ? { label: data.label } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.footnote?.title !== undefined ? { title: data.footnote.title } : {}),
        ...(data.footnote?.policies !== undefined ? { policies: data.footnote.policies } : {}),
        ...(data.footnote?.closing !== undefined ? { closing: data.footnote.closing } : {}),
      },
    });
    return this.toFrontend(row);
  }

  async remove(id: string) {
    if (FACTORY_DEFAULT_IDS.includes(id)) {
      throw new BadRequestException('Default templates cannot be deleted — use Reset instead');
    }
    await this.findOneOrThrow(id);
    await this.prisma.invoiceTemplate.delete({ where: { id } });
    return { success: true };
  }

  /** Restore a single default template (retail/bulk) to its factory content. */
  async resetOne(id: string) {
    const factory = FACTORY_DEFAULTS[id];
    if (!factory) {
      throw new BadRequestException(`"${id}" is not a default template and cannot be reset`);
    }
    const row = await this.prisma.invoiceTemplate.upsert({
      where: { id },
      create: { id, ...factory },
      update: { ...factory },
    });
    return this.toFrontend(row);
  }

  /** Restore both factory defaults and remove every custom template. */
  async resetAll() {
    await this.prisma.$transaction([
      this.prisma.invoiceTemplate.deleteMany({ where: { id: { notIn: FACTORY_DEFAULT_IDS } } }),
      ...FACTORY_DEFAULT_IDS.map((id) =>
        this.prisma.invoiceTemplate.upsert({
          where: { id },
          create: { id, ...FACTORY_DEFAULTS[id] },
          update: { ...FACTORY_DEFAULTS[id] },
        }),
      ),
    ]);
    return this.findAll();
  }
}
