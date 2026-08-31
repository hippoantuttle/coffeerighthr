# Blind review acceptance checks

1. Reviewer A draft: summary API returns `document_average: null` for A.
2. Reviewer A draft: detail review API returns `aggregate: null`, `peerReviews: []`.
3. Reviewer A submits all criteria: peer aggregate becomes visible to A.
4. Reviewer B has not submitted: B still receives no peer score/comment even after A submitted.
5. Submitted review edited later: status remains `submitted`; reviewer cannot revert to blind draft state.
6. Overall score = average of each reviewer's weighted score using 30/30/20/20 criteria.
