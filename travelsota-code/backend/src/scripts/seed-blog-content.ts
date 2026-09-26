import 'dotenv/config';
import { PrismaService } from '../shared/database/prisma.service';
import { BlogAdminService } from '../modules/blog/application/services/blog-admin.service';

interface CategorySeed {
  name: string;
  slug: string;
  description: string;
}

interface PostSeed {
  title: string;
  slug: string;
  categorySlug: string;
  excerpt: string;
  coverImageUrl: string;
  bodyHtml: string;
  metaTitle: string;
  metaDescription: string;
  metaKeywords: string;
  isFeatured: boolean;
}

const CATEGORIES: CategorySeed[] = [
  {
    name: 'Flight Advice',
    slug: 'flight-advice',
    description: 'Booking strategies, airline tips, and fare hacks from the TravelsOTA team.',
  },
  {
    name: 'Hotel Guides',
    slug: 'hotel-guides',
    description: 'How to pick, book, and enjoy the right hotel for any trip.',
  },
  {
    name: 'Travel Tips',
    slug: 'travel-tips',
    description: 'Practical advice for business and leisure travellers.',
  },
];

const POSTS: PostSeed[] = [
  {
    title: 'The TravelsOTA Guide to Booking Cheap Flights to Dubai',
    slug: 'cheap-flights-to-dubai-guide',
    categorySlug: 'flight-advice',
    excerpt:
      'Dubai is one of the world\u2019s best-connected hubs \u2014 and one of the easiest places to save on airfare if you know when to book, which airlines to watch, and how to use fare rules to your advantage.',
    coverImageUrl: 'https://images.pexels.com/photos/3225517/pexels-photo-3225517.jpeg?auto=compress&cs=tinysrgb&w=1600&h=900&fit=crop',
    bodyHtml: `<h2>Why Dubai fares swing so much</h2>
<p>Dubai sits at the crossroads of Europe, Asia, and Africa, which makes its airfare market one of the most competitive on earth. Over 90 carriers serve Dubai International (DXB), and that competition is your biggest ally. When Emirates and Etihad face off against Qatar Airways and flydubai, prices drop \u2014 but only for travellers who are ready to move fast.</p>
<blockquote><p>A common mistake is booking too early. For short-haul routes into Dubai, the sweet spot is usually <strong>6\u20138 weeks before departure</strong>; for long-haul, start watching at 4 months and expect the best fares around 10\u201312 weeks out.</p></blockquote>
<h2>When to book</h2>
<ul>
<li><strong>Long-haul (US, Europe, Asia-Pacific):</strong> book 3\u20134 months ahead; prices trend down until ~60 days out, then climb.</li>
<li><strong>Short-haul (GCC, India, Africa):</strong> book 4\u20136 weeks ahead \u2014 earlier rarely helps.</li>
<li><strong>Big events (Expo, New Year, Eid):</strong> book as far out as possible; fares triple in the final month.</li>
<li><strong>Seasonality:</strong> November\u2013March is peak (best weather). May\u2013September is the budget window.</li>
</ul>
<h2>Which airlines give you the most value</h2>
<p>Not all "cheap" tickets are equal. A low fare on a full-service carrier often includes 30kg of baggage and a meal, while an ultra-low-cost fare can end up costing more once you add a seat and a suitcase. Before you book, compare the <em>total</em> price:</p>
<ol>
<li>Add checked baggage for both directions.</li>
<li>Add a standard seat selection.</li>
<li>Check the layover \u2014 a 90-minute connection beats a 9-hour one at any price.</li>
</ol>
<h2>Fare rules that save you money</h2>
<p>Two tactics most travellers ignore:</p>
<p><strong>1. Open-jaw bookings.</strong> Fly into Dubai, return from Abu Dhabi. Airlines rarely price open-jaw higher, and you save an extra transfer. TravelsOTA supports open-jaw and multi-city searches directly.</p>
<p><strong>2. Day-of-week timing.</strong> Departures on Tuesday, Wednesday, and Saturday are consistently 10\u201320% cheaper than Friday and Sunday. A one-day shift can pay for your hotel.</p>
<h2>The bottom line</h2>
<p>Search on TravelsOTA, compare the all-in price including baggage, book in the 6\u201312-week window, and stay flexible on days. That combination regularly saves 25\u201340% versus a last-minute weekend departure.</p>`,
    metaTitle: 'How to Book Cheap Flights to Dubai in 2026 | TravelsOTA',
    metaDescription: 'When to book, which airlines give real value, and two fare rules that routinely save 25-40% on flights to Dubai.',
    metaKeywords: 'cheap flights dubai, book flights dubai, emirates deals, travelsota',
    isFeatured: true,
  },
  {
    title: 'How to Choose the Perfect Hotel: A Complete 2026 Checklist',
    slug: 'how-to-choose-the-perfect-hotel',
    categorySlug: 'hotel-guides',
    excerpt:
      'Star ratings only tell part of the story. Use this checklist \u2014 location first, then amenities, then reviews with a critical eye \u2014 to book a hotel you won\u2019t regret.',
    coverImageUrl: 'https://images.pexels.com/photos/78126/pexels-photo-78126.jpeg?auto=compress&cs=tinysrgb&w=1600&h=900&fit=crop',
    bodyHtml: `<h2>Start with location, not stars</h2>
<p>The biggest regret in hotel booking is almost never the room \u2014 it\u2019s the location. A four-star hotel 30 minutes from where you actually need to be costs you more in taxis and time than a three-star around the corner.</p>
<blockquote><p>Rule of thumb: if you\u2019re a sightseeing traveller, pay for proximity to the <strong>old town or metro line</strong>. If you\u2019re on business, pay for proximity to the <strong>convention centre or your client\u2019s office</strong>. Everything else is negotiable.</p></blockquote>
<h2>Decode star ratings</h2>
<p>Ratings measure facilities, not quality. A 5-star rating means a pool, gym, restaurants, and room service exist \u2014 not that they\u2019re good. Compare within the same tier:</p>
<ul>
<li><strong>3-star:</strong> clean, functional, great value. Best for travellers who are out all day.</li>
<li><strong>4-star:</strong> the sweet spot for most trips \u2014 good amenities, reasonable price.</li>
<li><strong>5-star:</strong> service and facilities shine, but you pay a 40\u201360% premium for them.</li>
</ul>
<h2>The amenity checklist</h2>
<table>
<thead><tr><th>Amenity</th><th>Worth it if\u2026</th></tr></thead>
<tbody>
<tr><td>Free breakfast</td><td>You eat before 10am and want to skip $25/day hotel food.</td></tr>
<tr><td>Airport shuttle</td><td>You land late or early \u2014 taxis are 3\u20134x the shuttle price.</td></tr>
<tr><td>Free cancellation</td><td>Plans can shift. It\u2019s the single most valuable checkbox.</td></tr>
<tr><td>Gym / pool</td><td>You actually use them. Otherwise it\u2019s just a higher rate.</td></tr>
<tr><td>In-room wifi quality</td><td>You work remotely \u2014 check recent reviews for "wifi" specifically.</td></tr>
</tbody>
</table>
<h2>Read reviews like a detective</h2>
<p>Average scores are almost useless. Filter for reviews that match <em>your</em> profile:</p>
<ol>
<li>Search the hotel\u2019s recent reviews for the word "noise" \u2014 you\u2019ll find the road-facing rooms.</li>
<li>Sort by newest, not "most helpful" \u2014 the hotel may have changed management or renovated.</li>
<li>Read the 3-star reviews, not just the 5-star ones. Middle reviews are where the truth lives.</li>
</ol>
<h2>Book with a price guarantee</h2>
<p>When you find a hotel you like, lock in a free-cancellation rate early, then re-check the price two weeks before check-in. Rates on TravelsOTA refresh continuously, and you can rebook at the lower price without penalty if your rate is free-cancellation. It\u2019s the easiest money-saving habit in travel.</p>`,
    metaTitle: 'How to Choose the Perfect Hotel: 2026 Checklist | TravelsOTA',
    metaDescription: 'Location first, decode star ratings, and read reviews like a detective. A practical checklist for booking the right hotel every time.',
    metaKeywords: 'choose hotel, hotel booking tips, hotel checklist, travelsota',
    isFeatured: false,
  },
  {
    title: 'Business Travel on a Budget: Smart Strategies for 2026',
    slug: 'business-travel-budget-strategies-2026',
    categorySlug: 'travel-tips',
    excerpt:
      'Corporate travel is getting more expensive \u2014 but smarter booking habits can cut 30% off your travel spend without downgrading your experience.',
    coverImageUrl: 'https://images.pexels.com/photos/1080696/pexels-photo-1080696.jpeg?auto=compress&cs=tinysrgb&w=1600&h=900&fit=crop',
    bodyHtml: `<h2>The cost problem nobody tracks</h2>
<p>Most companies track total travel spend but not the decisions behind it. That\u2019s a blind spot: two travellers booking the same route days apart can pay wildly different fares. The discipline that saves money is consistency, not sacrifice.</p>
<blockquote><p>The average business trip booked 3 days before departure costs <strong>30\u201340% more</strong> than the same trip booked 14 days out \u2014 with zero difference in comfort.</p></blockquote>
<h2>Five strategies that actually work</h2>
<ol>
<li><strong>Book 14\u201321 days out.</strong> The single biggest lever in business travel pricing.</li>
<li><strong>Set a fare cap, not a carrier cap.</strong> Allow any airline under a budget threshold; loyalty follows value, not the other way around.</li>
<li><strong>Use flexible fares selectively.</strong> Buy refundable on uncertain trips, non-refundable on confirmed ones \u2014 not the reverse.</li>
<li><strong>Standardise the "no-show" policy.</strong> A no-show burns the fare AND the cancellation policy. Build a 24-hour rebooking rule.</li>
<li><strong>Consolidate one trip per quarter.</strong> Two regional trips often cost more than one consolidated trip \u2014 including the hotel night.</li>
</ol>
<h2>Loyalty programmes done right</h2>
<p>Loyalty programmes are worth real money \u2014 but only if you earn with a strategy:</p>
<ul>
<li>Pick <strong>one airline alliance</strong> and one hotel chain and stay loyal. Status upgrades alone repay the habit.</li>
<li>Book through your employer\u2019s preferred programme \u2014 many add a 5\u201310% points bonus.</li>
<li>Never let loyalty override price by more than 15%. Points are nice; cash in the budget is nicer.</li>
</ul>
<h2>Track it, then improve it</h2>
<p>What gets measured gets cheaper. At a minimum, log per-trip: booking lead time, airline, cabin, fare vs. the same route\u2019s 14-day baseline. Within two quarters you\u2019ll see exactly which habit is leaking money \u2014 and it\u2019s almost always last-minute bookings.</p>
<p><strong>The takeaway:</strong> business travel on a budget isn\u2019t about downgrading. It\u2019s about standardising the three habits that matter: lead time, fare caps, and flexible-fare discipline.</p>`,
    metaTitle: 'Business Travel on a Budget: 2026 Strategies | TravelsOTA',
    metaDescription: 'Cut 30% off corporate travel spend with five practical strategies: lead time, fare caps, flexible fares, consolidation, and smarter loyalty.',
    metaKeywords: 'business travel budget, corporate travel savings, travel policy, travelsota',
    isFeatured: false,
  },
];

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const admin = new BlogAdminService(prisma);

  try {
    const adminUser = await prisma.user.findFirst({
      where: { email: process.env.ADMIN_EMAIL ?? 'admin@travelsota.com', deletedAt: null },
      select: { id: true },
    });
    if (adminUser) console.log(`author: admin user ${adminUser.id}`);

    let created = 0;

    for (const cat of CATEGORIES) {
      const existing = await prisma.blogCategory.findUnique({ where: { slug: cat.slug } });
      if (existing) {
        console.log(`category exists: ${cat.slug}`);
        continue;
      }
      await admin.createCategory({ name: cat.name, slug: cat.slug, description: cat.description });
      console.log(`category created: ${cat.slug}`);
    }

    const catMap = new Map<string, string>();
    const cats = await prisma.blogCategory.findMany();
    for (const c of cats) catMap.set(c.slug, c.id);

    for (const post of POSTS) {
      const existing = await prisma.blogPost.findUnique({ where: { slug: post.slug } });
      if (existing) {
        console.log(`post exists: ${post.slug}`);
        continue;
      }
      const createdPost = await admin.create(
        {
          title: post.title,
          slug: post.slug,
          excerpt: post.excerpt,
          coverImageUrl: post.coverImageUrl,
          bodyHtml: post.bodyHtml,
          status: 'PUBLISHED',
          categoryId: catMap.get(post.categorySlug),
          isFeatured: post.isFeatured,
          metaTitle: post.metaTitle,
          metaDescription: post.metaDescription,
          metaKeywords: post.metaKeywords,
        },
        adminUser?.id,
      );
      console.log(`post created: ${createdPost.slug}`);
      created++;
    }

    console.log(`\nDone. Created ${created} new post(s).`);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
