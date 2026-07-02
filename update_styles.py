import re

with open('frontend/src/screens/contractor/ContractorDashboard.js', 'r', encoding='utf-8') as f:
    content = f.read()

styles_to_inject = '''
  jobItemRow: {
    marginBottom: 14,
    borderBottomWidth: 1.2,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 14
  },
  jobItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12
  },
  addressCol: {
    flex: 1,
    marginRight: 8
  },
  addressText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#1E293B',
    marginBottom: 3
  },
  timeRangeText: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '600'
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center'
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.2
  },'''

if 'jobItemRow:' not in content:
    content = content.replace('  profileSectionTitle: {', styles_to_inject + '\n  profileSectionTitle: {')

with open('frontend/src/screens/contractor/ContractorDashboard.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated styles successfully")
