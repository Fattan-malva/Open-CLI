//! Port of mailbox/agent-sender-associations.ts: content comparison of sender publications.
//! Field-by-field, in row order; key order and the revision never count.

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Association {
    pub identity: String,
    pub pane_key: String,
    pub worktree_id: String,
    pub session_id: Option<String>,
    /// The addressed Dispatch still has its own proved live invocation. Transient display only.
    pub dispatch_actor: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Principal {
    pub peer_fingerprint: String,
    pub home_peer_fingerprint: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Attachment {
    pub association: Association,
    pub home_peer_fingerprint: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PublicationContent {
    pub peer_fingerprint: Option<String>,
    pub principals: Vec<Principal>,
    pub associations: Vec<Association>,
    pub attachments: Vec<Attachment>,
}

fn same_association(a: &Association, b: &Association) -> bool {
    a == b
}

fn same_attachment(a: &Attachment, b: &Attachment) -> bool {
    a.home_peer_fingerprint == b.home_peer_fingerprint && same_association(&a.association, &b.association)
}

fn same_principal(a: &Principal, b: &Principal) -> bool {
    a.peer_fingerprint == b.peer_fingerprint && a.home_peer_fingerprint == b.home_peer_fingerprint
}

fn same_rows<T>(a: &[T], b: &[T], same: impl Fn(&T, &T) -> bool) -> bool {
    a.len() == b.len() && a.iter().zip(b.iter()).all(|(x, y)| same(x, y))
}

pub fn same_sender_content(a: &PublicationContent, b: &PublicationContent) -> bool {
    a.peer_fingerprint == b.peer_fingerprint
        && same_rows(&a.principals, &b.principals, same_principal)
        && same_rows(&a.associations, &b.associations, same_association)
        && same_rows(&a.attachments, &b.attachments, same_attachment)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assoc(identity: &str) -> Association {
        Association {
            identity: identity.into(),
            pane_key: "p".into(),
            worktree_id: "w".into(),
            session_id: None,
            dispatch_actor: false,
        }
    }

    fn content(identity: &str) -> PublicationContent {
        PublicationContent {
            peer_fingerprint: Some("peer".into()),
            principals: vec![],
            associations: vec![assoc(identity)],
            attachments: vec![],
        }
    }

    #[test]
    fn identical_content_compares_equal() {
        assert!(same_sender_content(&content("a"), &content("a")));
    }

    #[test]
    fn any_changed_row_field_breaks_equality() {
        assert!(!same_sender_content(&content("a"), &content("b")));
        let mut dispatch = content("a");
        dispatch.associations[0].dispatch_actor = true;
        assert!(!same_sender_content(&content("a"), &dispatch));
    }

    #[test]
    fn row_order_matters() {
        let mut a = content("x");
        a.associations.push(assoc("y"));
        let mut b = content("x");
        b.associations = vec![assoc("y"), assoc("x")];
        assert!(!same_sender_content(&a, &b));
    }
}
