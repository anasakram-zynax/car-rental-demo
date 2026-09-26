import { chromium } from '@playwright/test';
import { writeFileSync } from 'fs';

async function capture() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  try {
    await page.goto('https://www.wego.pk/', { waitUntil: 'networkidle', timeout: 30000 });
    
    // Wait a moment for everything to render
    await page.waitForTimeout(2000);

    // Take full page screenshot
    await page.screenshot({ path: 'wego-screenshot.png', fullPage: true });
    console.log('Screenshot saved: wego-screenshot.png');

    // Extract detailed page structure info
    const info = await page.evaluate(() => {
      // Helper to get element info
      function elInfo(el) {
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return {
          tag: el.tagName,
          text: el.textContent?.trim()?.slice(0, 100),
          rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
          bgColor: style.backgroundColor,
          color: style.color,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          fontFamily: style.fontFamily,
          borderRadius: style.borderRadius,
          boxShadow: style.boxShadow,
          backdrop: style.backdropFilter,
        };
      }

      const data = {};

      // ─── HEADER ───
      const header = document.querySelector('header');
      if (header) {
        data.header = elInfo(header);
        data.header.links = [];
        header.querySelectorAll('a').forEach(a => {
          data.header.links.push({ text: a.textContent?.trim(), href: a.href });
        });
        // All nav links
        const nav = header.querySelector('nav');
        if (nav) {
          data.header.navLinks = [];
          nav.querySelectorAll('a, button, span').forEach(el => {
            const t = el.textContent?.trim();
            if (t) data.header.navLinks.push(t);
          });
        }
      }

      // ─── HERO ───
      // Try to find the hero section (first large section)
      const sections = document.querySelectorAll('section, div[class*="hero"], div[class*="banner"], [class*="search-section"]');
      let hero = sections[0];
      if (!hero) {
        // Fallback: first major content div
        const main = document.querySelector('main') || document.body;
        hero = main.children[0];
      }
      
      if (hero) {
        data.hero = elInfo(hero);
        // Hero background image
        const heroStyle = window.getComputedStyle(hero);
        data.hero.bgImage = heroStyle.backgroundImage;
        data.hero.bgGradient = heroStyle.background;
        
        // All hero text
        data.hero.headings = [];
        hero.querySelectorAll('h1, h2, h3, p, span').forEach(el => {
          const t = el.textContent?.trim();
          if (t && t.length < 200) {
            data.hero.headings.push({
              tag: el.tagName,
              text: t.slice(0, 120),
              fontSize: window.getComputedStyle(el).fontSize,
              color: window.getComputedStyle(el).color,
            });
          }
        });
      }

      // ─── SEARCH BOX / WIDGET ───
      // Find the main search form
      const form = document.querySelector('form') || document.querySelector('[class*="search"]');
      if (form) {
        data.searchForm = elInfo(form);
        
        // All input fields
        data.searchForm.inputs = [];
        form.querySelectorAll('input, select, button[type="submit"], [role="button"]').forEach(el => {
          const t = el.textContent?.trim();
          const p = el.getAttribute('placeholder');
          data.searchForm.inputs.push({
            tag: el.tagName,
            type: el.getAttribute('type'),
            placeholder: p,
            text: t?.slice(0, 50),
            icon: el.querySelector('svg') ? 'yes' : 'no',
          });
        });

        // Tabs (Flights/Hotels)
        const tabs = form.querySelectorAll('[class*="tab"], [role="tab"]');
        data.searchForm.tabs = [];
        tabs.forEach(t => {
          const t2 = t.textContent?.trim();
          if (t2) data.searchForm.tabs.push(t2);
        });
      }

      // Also try to find search widget by common class names
      const widgets = document.querySelectorAll('[class*="search-widget"], [class*="search-box"], [class*="search-card"]');
      if (widgets.length > 0) {
        data.searchWidget = elInfo(widgets[0]);
      }

      // ─── COLORS ───
      data.colors = {};
      // Get dominant colors from header and body
      const bodyStyle = window.getComputedStyle(document.body);
      data.colors.bodyBg = bodyStyle.backgroundColor;
      data.colors.bodyColor = bodyStyle.color;

      return data;
    });

    writeFileSync('wego-analysis.json', JSON.stringify(info, null, 2));
    console.log('Analysis saved: wego-analysis.json');
    console.log('\n=== KEY FINDINGS ===');
    console.log(JSON.stringify(info, null, 2));

  } catch (err) {
    console.error('Error:', err.message);
    // Take screenshot even on error
    await page.screenshot({ path: 'wego-error.png' });
    console.log('Error screenshot saved: wego-error.png');
  } finally {
    await browser.close();
  }
}

capture();
