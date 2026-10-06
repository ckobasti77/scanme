import { describe, expect, test } from "vitest";
import { escapeEmailHtml, renderScanMeEmail, scanMeBodyHtml, SCANME_EMAIL_SITE_URL } from "./scanme-email";

// Admin UX Z2 — the one ScanMe email template: escape, markup, signature,
// quote/forward, plain-text alternative. TEST content only.

describe("ScanMe email template", () => {
  test("brand frame: text wordmark in brand colors, accent bar, table layout, footer link", () => {
    const { html } = renderScanMeEmail({ bodyText: "Zdravo", subject: "TEST naslov" });
    expect(html.startsWith("<!doctype html><html lang=\"sr\">")).toBe(true);
    expect(html).toContain("<title>TEST naslov</title>");
    expect(html).toContain('<span style="color:#273331;">Scan</span><span style="color:#668f00;">Me</span>');
    expect(html).toContain("border-bottom:3px solid #c6ff4a");
    expect(html).toContain('role="presentation"');
    expect(html).toContain("font-family:Arial,Helvetica,sans-serif");
    expect(html).toContain(`<a href="${SCANME_EMAIL_SITE_URL}"`);
    expect(html).not.toMatch(/<img|<script|<style|class=/);
  });

  test("everything the writer typed is escaped; only the small markup becomes HTML", () => {
    const body = scanMeBodyHtml('<script>alert("x")</script> & <b>ne</b>\n**podebljano** i [ponuda](https://example.invalid/a?b=1&c=2)\n\nDrugi pasus https://example.invalid/x. kraj');
    expect(body).toBe(
      '<p style="margin:0 0 16px;">&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &lt;b&gt;ne&lt;/b&gt;<br>' +
        '<strong>podebljano</strong> i <a href="https://example.invalid/a?b=1&amp;c=2" style="color:#3f6b00;text-decoration:underline;">ponuda</a></p>' +
        '<p style="margin:0 0 16px;">Drugi pasus <a href="https://example.invalid/x" style="color:#3f6b00;text-decoration:underline;">https://example.invalid/x</a>. kraj</p>',
    );
  });

  test("only http, https and mailto become links; no attribute can be broken out of", () => {
    const body = scanMeBodyHtml('[klik](javascript:alert(1)) [mail](mailto:tim@example.invalid) [x](https://example.invalid/"onmouseover="a) data:text/html,x');
    expect(body).not.toContain('href="javascript');
    expect(body).toContain('<a href="mailto:tim@example.invalid"');
    expect(body).toContain('href="https://example.invalid/&quot;onmouseover=&quot;a"');
    expect(body).not.toMatch(/href="data:/);
    // **bold** never lands inside an href
    expect(scanMeBodyHtml("https://example.invalid/**a**")).toContain('href="https://example.invalid/**a**"');
  });

  test("| a | b | lines become an email-client table (first row as header when followed by ---)", () => {
    const body = scanMeBodyHtml("| Model | Cena |\n| --- | --- |\n| TEST X1 | **na upit** |");
    expect(body).toMatch(/^<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;/);
    expect(body).toContain(">Model</th>");
    expect(body).toContain(">TEST X1</td>");
    expect(body).toContain("><strong>na upit</strong></td>");
    expect(body).not.toContain("---");
  });

  test("signature: escaped lines with links, after the body; empty signature adds nothing", () => {
    const { html, text } = renderScanMeEmail({ bodyText: "Telo", signatureText: "TEST Admin\n[www.scanme.rs](https://www.scanme.rs) <i>" });
    expect(html).toContain('>TEST Admin<br><a href="https://www.scanme.rs" style="color:#3f6b00;text-decoration:underline;">www.scanme.rs</a> &lt;i&gt;</div>');
    expect(html.indexOf("Telo")).toBeLessThan(html.indexOf("TEST Admin"));
    expect(text).toContain("-- \nTEST Admin\nwww.scanme.rs (https://www.scanme.rs) <i>");
    expect(renderScanMeEmail({ bodyText: "Telo", signatureText: "  " }).html).not.toContain("padding-top:16px;border-top");
  });

  test("reply quote: header and the original as escaped text in a blockquote; > lines in the text version", () => {
    const { html, text } = renderScanMeEmail({
      bodyText: "Hvala.",
      quote: { kind: "reply", header: "6. 10. 2026. 09:40, TEST <a@example.invalid> piše:", text: "Prvi <red>\n\nTreći red" },
    });
    expect(html).toContain("6. 10. 2026. 09:40, TEST &lt;a@example.invalid&gt; piše:</p>");
    expect(html).toMatch(/<blockquote style="[^"]*border-left:3px solid #d5d9cc;[^"]*">Prvi &lt;red&gt;<br><br>Treći red<\/blockquote>/);
    expect(text).toContain("6. 10. 2026. 09:40, TEST <a@example.invalid> piše:\n> Prvi <red>\n>\n> Treći red");
  });

  test("forward block: header, labelled lines and the original text", () => {
    const { html, text } = renderScanMeEmail({
      bodyText: "Prosleđujem.",
      quote: { kind: "forward", header: "---------- Prosleđena poruka ----------", lines: [{ label: "Od", value: "TEST <a@example.invalid>" }, { label: "Naslov", value: "TEST & ponuda" }], text: "Original" },
    });
    expect(html).toContain("---------- Prosleđena poruka ----------<br><strong>Od:</strong> TEST &lt;a@example.invalid&gt;<br><strong>Naslov:</strong> TEST &amp; ponuda</p><div>Original</div>");
    expect(text).toContain("---------- Prosleđena poruka ----------\nOd: TEST <a@example.invalid>\nNaslov: TEST & ponuda\n\nOriginal");
  });

  test("plain-text alternative: no tags, links as text (url), bold unwrapped, footer with the site", () => {
    const { text } = renderScanMeEmail({ bodyText: "**Važno**: [ponuda](https://example.invalid/p)\r\n\r\nhttps://example.invalid/q", signatureText: "TEST" });
    expect(text).toBe(`Važno: ponuda (https://example.invalid/p)\n\nhttps://example.invalid/q\n\n-- \nTEST\n\n--\nScanMe · ${SCANME_EMAIL_SITE_URL}`);
    expect(text).not.toMatch(/<[a-z]/i);
  });

  test("escapeEmailHtml covers the five HTML characters", () => {
    expect(escapeEmailHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#039;&amp;&#039;&lt;/a&gt;");
  });
});
