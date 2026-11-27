//! Port of crew/crew-claim-reduction.ts: strongly connected components preserve corrupt cycles
//! while reducing proven acyclic successors.

use std::collections::{HashMap, HashSet};

pub fn maximal_crew_claims(keys: &[String], successors: &HashMap<String, HashSet<String>>) -> HashSet<String> {
    let mut reverse: HashMap<String, Vec<String>> = HashMap::new();
    for (from, targets) in successors {
        for to in targets {
            reverse.entry(to.clone()).or_default().push(from.clone());
        }
    }
    let empty = HashSet::new();
    let mut visited: HashSet<String> = HashSet::new();
    let mut finished: Vec<String> = Vec::new();
    for key in keys {
        let mut stack: Vec<(String, bool)> = vec![(key.clone(), false)];
        while let Some((k, finish)) = stack.pop() {
            if finish {
                finished.push(k);
            } else if !visited.contains(&k) {
                visited.insert(k.clone());
                stack.push((k.clone(), true));
                for target in successors.get(&k).unwrap_or(&empty) {
                    if !visited.contains(target) {
                        stack.push((target.clone(), false));
                    }
                }
            }
        }
    }
    let mut component: HashMap<String, usize> = HashMap::new();
    let mut count = 0usize;
    for key in finished.iter().rev() {
        if component.contains_key(key) {
            continue;
        }
        let mut stack = vec![key.clone()];
        component.insert(key.clone(), count);
        while let Some(k) = stack.pop() {
            for previous in reverse.get(&k).map(|v| v.as_slice()).unwrap_or(&[]) {
                if !component.contains_key(previous) {
                    component.insert(previous.clone(), count);
                    stack.push(previous.clone());
                }
            }
        }
        count += 1;
    }
    let mut sizes: HashMap<usize, usize> = HashMap::new();
    for id in component.values() {
        *sizes.entry(*id).or_insert(0) += 1;
    }
    keys.iter()
        .filter(|key| {
            let comp = component.get(*key).copied().unwrap_or(usize::MAX);
            sizes.get(&comp).copied().unwrap_or(0) > 1
                || !successors.get(*key).unwrap_or(&empty).iter().any(|next| component.get(next).copied() != Some(comp))
        })
        .cloned()
        .collect()
}
