//! Port of crew/dispatch-presentation-priority.ts + dispatch-presentation-deadlines.ts.
//! A binary min-heap keyed by priority with arbitrary removal; lower priority pops first.

use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq)]
pub struct PriorityItem {
    pub id: String,
    pub priority: f64,
}

#[derive(Debug, Default)]
pub struct DispatchPresentationPriority {
    positions: HashMap<String, usize>,
    items: Vec<PriorityItem>,
}

impl DispatchPresentationPriority {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn set(&mut self, id: &str, priority: f64) {
        self.delete(id);
        self.items.push(PriorityItem { id: id.to_string(), priority });
        let idx = self.items.len() - 1;
        self.positions.insert(id.to_string(), idx);
        self.up(idx);
    }

    pub fn delete(&mut self, id: &str) {
        let Some(index) = self.positions.get(id).copied() else { return };
        let last = self.items.pop().unwrap();
        self.positions.remove(id);
        if index >= self.items.len() {
            return;
        }
        self.items[index] = last.clone();
        self.positions.insert(last.id.clone(), index);
        let moved = self.up(index);
        if moved == index {
            self.down(index);
        }
    }

    pub fn size(&self) -> usize {
        self.items.len()
    }

    pub fn peek(&self) -> Option<&PriorityItem> {
        self.items.first()
    }

    pub fn clear(&mut self) {
        self.items.clear();
        self.positions.clear();
    }

    fn swap(&mut self, a: usize, b: usize) {
        self.items.swap(a, b);
        let ida = self.items[a].id.clone();
        let idb = self.items[b].id.clone();
        self.positions.insert(ida, a);
        self.positions.insert(idb, b);
    }

    fn up(&mut self, mut index: usize) -> usize {
        while index > 0 {
            let parent = (index - 1) >> 1;
            if self.items[parent].priority <= self.items[index].priority {
                break;
            }
            self.swap(index, parent);
            index = parent;
        }
        index
    }

    fn down(&mut self, mut index: usize) {
        loop {
            let left = index * 2 + 1;
            let right = left + 1;
            let child = if right < self.items.len() && self.items[right].priority < self.items[left].priority { right } else { left };
            if child >= self.items.len() || self.items[index].priority <= self.items[child].priority {
                return;
            }
            self.swap(index, child);
            index = child;
        }
    }
}

/// One addressable deadline per eligible dispatch; removing its owner also removes its deadline.
#[derive(Debug, Default)]
pub struct DispatchPresentationDeadlines {
    inner: DispatchPresentationPriority,
}

impl DispatchPresentationDeadlines {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn set(&mut self, id: &str, deadline_ms: f64) {
        self.inner.set(id, deadline_ms);
    }

    pub fn delete(&mut self, id: &str) {
        self.inner.delete(id);
    }

    pub fn size(&self) -> usize {
        self.inner.size()
    }

    pub fn clear(&mut self) {
        self.inner.clear();
    }

    /// Deadlines strictly before `now`, removing them as yielded. (TS `priority < now`.)
    pub fn expired(&mut self, now: f64) -> Vec<String> {
        let mut out = Vec::new();
        while let Some(next) = self.inner.peek() {
            if next.priority >= now {
                break;
            }
            let id = next.id.clone();
            self.inner.delete(&id);
            out.push(id);
        }
        out
    }
}
