//! 아주 작은 JSON 쓰개 (의존성 0). 키 순서 = 넣은 순서.

pub struct Obj {
    s: String,
    first: bool,
}

impl Default for Obj {
    fn default() -> Self {
        Self::new()
    }
}

pub fn esc(v: &str) -> String {
    let mut o = String::with_capacity(v.len() + 2);
    for ch in v.chars() {
        match ch {
            '"' => o.push_str("\\\""),
            '\\' => o.push_str("\\\\"),
            '\n' => o.push_str("\\n"),
            c if (c as u32) < 0x20 => o.push_str(&format!("\\u{:04x}", c as u32)),
            c => o.push(c),
        }
    }
    o
}

pub fn num(v: f64, prec: usize) -> String {
    if v.is_finite() {
        format!("{:.*}", prec, v)
    } else {
        "null".into()
    }
}

impl Obj {
    pub fn new() -> Self {
        Self { s: String::from("{"), first: true }
    }
    fn key(&mut self, k: &str) {
        if !self.first {
            self.s.push(',');
        }
        self.first = false;
        self.s.push('"');
        self.s.push_str(&esc(k));
        self.s.push_str("\":");
    }
    pub fn s(&mut self, k: &str, v: &str) -> &mut Self {
        self.key(k);
        self.s.push('"');
        self.s.push_str(&esc(v));
        self.s.push('"');
        self
    }
    pub fn f(&mut self, k: &str, v: f64, prec: usize) -> &mut Self {
        self.key(k);
        self.s.push_str(&num(v, prec));
        self
    }
    pub fn u(&mut self, k: &str, v: u64) -> &mut Self {
        self.key(k);
        self.s.push_str(&v.to_string());
        self
    }
    pub fn b(&mut self, k: &str, v: bool) -> &mut Self {
        self.key(k);
        self.s.push_str(if v { "true" } else { "false" });
        self
    }
    pub fn raw(&mut self, k: &str, v: &str) -> &mut Self {
        self.key(k);
        self.s.push_str(v);
        self
    }
    pub fn end(&mut self) -> String {
        let mut o = self.s.clone();
        o.push('}');
        o
    }
}

pub fn arr(items: &[String]) -> String {
    format!("[{}]", items.join(","))
}
