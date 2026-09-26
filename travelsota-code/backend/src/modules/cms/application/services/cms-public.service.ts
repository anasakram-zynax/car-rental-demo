import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { BusinessError } from '../../../../shared/errors/business-error';
import type { CmsPosition } from '../../../../generated';

export interface MenuNode {
  id: string;
  label: string;
  url: string | null;
  target: '_self' | '_blank';
  children: MenuNode[];
}

const DEFAULT_PAGE_TRANSLATIONS: Record<
  string,
  Record<string, { name: string; description?: string; content: string }>
> = {
  about: {
    ar: {
      name: 'من نحن',
      description: 'تعرف على ترافلز أو تي إيه — منصة حجز السفر التي تربط الوكلاء والمسافرين والموردين حول العالم.',
      content: `<h2>عن ترافلز أو تي إيه</h2>
<p>ترافلز أو تي إيه هي منصة حجز سفر متعددة القنوات مصممة لوكلاء السفر وعملاء الشركات والمسافرين الأفراد. نحن نربط مخزون ترافلبورت (NDC + GDS) وهوتبيدز في تدفق حجز موحد يدير البحث والتسعير والدفع وإصدار التذاكر وإدارة ما بعد الحجز — كل ذلك من خلال واجهة واحدة.</p>
<h3>ما نقوم به</h3>
<ul>
<li><strong>لوحة تحكم المشرف:</strong> تحكم تشغيلي كامل — إدارة المستخدمين، والوصول القائم على الأدوار، وتكوين الموردين، وإعداد بوابات الدفع، ومراقبة الحجوزات، والتحليلات وسجلات التدقيق.</li>
<li><strong>لوحة تحكم الوكيل:</strong> أدوات حجز بعلامة تجارية مخصصة مع تتبع العمولات، وإدارة هوامش الربح، وحدود الائتمان، وإدارة الوكلاء الفرعيين، وتقارير في الوقت الفعلي.</li>
<li><strong>بوابة العملاء:</strong> بحث وحجز الرحلات الجوية والفنادق بأسعار شفافة وخيارات دفع متعددة ومتابعة حالة الحجز في الوقت الفعلي.</li>
</ul>
<h3>تقنيتنا</h3>
<p>تم بناء المنصة على بنية هندسية مرنة مع قواعد بيانات عالية الأداء وأمان متكامل، لضمان حماية بيانات الحجوزات والمدفوعات.</p>`,
    },
    fr: {
      name: 'À propos de nous',
      description: 'Découvrez TravelsOTA — la plateforme de réservation de voyages reliant agents, voyageurs et fournisseurs dans le monde entier.',
      content: `<h2>À propos de TravelsOTA</h2>
<p>TravelsOTA est une plateforme de réservation de voyages multicanal conçue pour les agents de voyages, les entreprises et les voyageurs individuels. Nous connectons les inventaires Travelport (NDC + GDS) et Hotelbeds dans un flux de réservation unifié gérant la recherche, la tarification, le paiement et la billetterie — le tout via une interface unique.</p>
<h3>Nos solutions</h3>
<ul>
<li><strong>Panneau d'administration :</strong> Contrôle opérationnel complet — gestion des utilisateurs, rôles, configuration des fournisseurs et des passerelles de paiement, supervision des réservations et analyses.</li>
<li><strong>Tableau de bord agent :</strong> Outils de réservation en marque blanche avec suivi des commissions, marges, limites de crédit et rapports en temps réel.</li>
<li><strong>Portail client :</strong> Recherche et réservation de vols et d'hôtels avec tarification transparente et paiements sécurisés.</li>
</ul>
<h3>Notre technologie</h3>
<p>Construit sur une architecture moderne haute disponibilité garantissant l'intégrité des transactions et la sécurité des données de paiement.</p>`,
    },
    es: {
      name: 'Sobre nosotros',
      description: 'Conozca TravelsOTA: la plataforma de reservas de viajes que conecta agentes, viajeros y proveedores de todo el mundo.',
      content: `<h2>Sobre TravelsOTA</h2>
<p>TravelsOTA es una plataforma de reserva de viajes multicanal diseñada para agencias de viajes, empresas y viajeros particulares. Conectamos inventarios de Travelport (NDC + GDS) y Hotelbeds en un flujo de reserva unificado que gestiona la búsqueda, fijación de precios, pagos y emisión de billetes.</p>
<h3>Qué ofrecemos</h3>
<ul>
<li><strong>Panel de administración:</strong> Control operativo total — gestión de usuarios, roles, proveedores, pasarelas de pago y análisis en tiempo real.</li>
<li><strong>Panel de agentes:</strong> Herramientas de reserva de marca blanca con gestión de comisiones, márgenes, límites de crédito y reportes inmediatos.</li>
<li><strong>Portal del cliente:</strong> Búsqueda y reserva de vuelos y hoteles con precios transparentes y múltiples métodos de pago.</li>
</ul>
<h3>Nuestra tecnología</h3>
<p>Desarrollado con estándares de última generación para asegurar confirmaciones rápidas y pagos totalmente protegidos.</p>`,
    },
    de: {
      name: 'Über uns',
      description: 'Erfahren Sie mehr über TravelsOTA – die Reisebuchungsplattform, die Reisebüros, Reisende und Anbieter weltweit verbindet.',
      content: `<h2>Über TravelsOTA</h2>
<p>TravelsOTA ist eine Multichannel-Reisebuchungsplattform für Reisebüros, Unternehmen und Individualreisende. Wir verknüpfen Inventare von Travelport (NDC + GDS) und Hotelbeds in einem einheitlichen Buchungsprozess für Suche, Preisfindung, Zahlung und Ticketing.</p>
<h3>Unsere Leistungen</h3>
<ul>
<li><strong>Admin-Portal:</strong> Vollständige Betriebssteuerung — Benutzerverwaltung, Rollenzugriff, Anbieterkonfiguration und Analysen.</li>
<li><strong>Agenten-Dashboard:</strong> White-Label-Buchungstools mit Provisionsverfolgung, Markup-Verwaltung und Kreditlimits.</li>
<li><strong>Kundenportal:</strong> Flüge und Hotels mit transparenten Preisen und flexiblen Zahlungsmethoden buchen.</li>
</ul>
<h3>Unsere Technologie</h3>
<p>Modernste Softwarearchitektur für maximale Zuverlässigkeit, Datenschutz und sichere Transaktionen.</p>`,
    },
    zh: {
      name: '关于我们',
      description: '了解 TravelsOTA —— 连接全球代理商、旅客与供应商的多渠道旅行预订平台。',
      content: `<h2>关于 TravelsOTA</h2>
<p>TravelsOTA 是专为旅行代理商、企业客户及个人旅客打造的多渠道旅行预订平台。我们整合 Travelport (NDC + GDS) 与 Hotelbeds 库存，在单一平台提供涵盖搜索、报价、支付与出票的完整工作流。</p>
<h3>核心能力</h3>
<ul>
<li><strong>管理员控制台：</strong> 完整的运营控制 —— 用户与权限管理、供应商接入、支付网关配置及实时审计追踪。</li>
<li><strong>代理商工作台：</strong> 白标预订系统，支持佣金分润、加价规则、信用额度与多级分销。</li>
<li><strong>用户预订门户：</strong> 实时透明搜索并预订全球航班与酒店，支持多种合规支付方式。</li>
</ul>
<h3>技术架构</h3>
<p>采用高可用微服务架构与强一致性数据保障，确保每一次交易准确无误与资金安全。</p>`,
    },
    tr: {
      name: 'Hakkımızda',
      description: 'Dünya çapında acenteleri, gezginleri ve tedarikçileri birbirine bağlayan seyahat rezervasyon platformu TravelsOTA hakkında bilgi edinin.',
      content: `<h2>TravelsOTA Hakkında</h2>
<p>TravelsOTA, seyahat acenteleri, kurumsal firmalar ve bireysel gezginler için geliştirilmiş çok kanallı bir seyahat rezervasyon platformudur. Travelport (NDC + GDS) ve Hotelbeds envanterlerini birleştirerek arama, fiyatlandırma, ödeme ve biletleme adımlarını tek ekranda sunar.</p>
<h3>Neler Sunuyoruz?</h3>
<ul>
<li><strong>Yönetici Paneli:</strong> Operasyonel kontrol, kullanıcı yetkilendirme, tedarikçi ve ödeme yapılandırmaları.</li>
<li><strong>Acente Paneli:</strong> Komisyon takibi, fiyat marjları, kredi limitleri ve anlık raporlama sunan özel acente araçları.</li>
<li><strong>Kullanıcı Portalı:</strong> Şeffaf fiyatlarla uçuş ve otel rezervasyonu yapma imkanı.</li>
</ul>
<h3>Teknolojimiz</h3>
<p>Yüksek performanslı altyapı ve güvenli ödeme protokolleri ile kesintisiz seyahat deneyimi sağlar.</p>`,
    },
  },
};

@Injectable()
export class CmsPublicService {
  constructor(private readonly prisma: PrismaService) {}

  async getPageBySlug(slug: string, lang?: string) {
    const page = await this.prisma.cmsPage.findUnique({ where: { slug } });
    if (!page || !page.isActive) throw new BusinessError('CMS_PAGE_NOT_FOUND');

    if (lang && lang !== 'en') {
      const nameTranslations = (page.nameTranslations ?? {}) as Record<
        string,
        string
      >;
      const contentTranslations = (page.contentTranslations ?? {}) as Record<
        string,
        string
      >;
      const fallback = DEFAULT_PAGE_TRANSLATIONS[slug]?.[lang];

      const name = nameTranslations[lang] ?? fallback?.name;
      const content = contentTranslations[lang] ?? fallback?.content;
      const description = fallback?.description ?? page.description;

      if (name || content) {
        return {
          ...page,
          name: name ?? page.name,
          content: content ?? page.content,
          description: description ?? page.description,
          nameTranslations: null,
          contentTranslations: null,
        };
      }
    }

    return { ...page, nameTranslations: null, contentTranslations: null };
  }

  async getMenuTree(
    position: 'HEADER' | 'FOOTER' | 'BOTH',
  ): Promise<MenuNode[]> {
    const where =
      position === 'BOTH'
        ? { isActive: true }
        : {
            isActive: true,
            OR: [
              { position: position as CmsPosition },
              { position: 'BOTH' as CmsPosition },
            ],
          };

    const items = await this.prisma.cmsMenu.findMany({
      where,
      include: { cmsPage: { select: { id: true, slug: true } } },
      orderBy: { sortOrder: 'asc' },
    });

    const build = (parentId: string | null): MenuNode[] =>
      items
        .filter((item) => (item.parentId ?? null) === parentId)
        .map((item) => {
          const url =
            item.linkType === 'PAGE'
              ? item.cmsPage
                ? `/page/${item.cmsPage.slug}`
                : null
              : item.url;
          return {
            id: item.id,
            label: item.label,
            url,
            target: item.target === 'BLANK' ? '_blank' : '_self',
            children: build(item.id),
          };
        });

    return build(null);
  }

  async getFooter() {
    const categories = await this.prisma.cmsFooterCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        menus: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          include: { cmsPage: { select: { id: true, slug: true } } },
        },
      },
    });

    return categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      menus: cat.menus.map((m) => ({
        id: m.id,
        label: m.label,
        url: m.linkType === 'PAGE' ? (m.cmsPage ? `/page/${m.cmsPage.slug}` : null) : m.url,
        target: m.target === 'BLANK' ? '_blank' : '_self',
      })),
    }));
  }
}
