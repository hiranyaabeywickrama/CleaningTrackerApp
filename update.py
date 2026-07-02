import re

with open('frontend/src/screens/contractor/ContractorDashboard.js', 'r', encoding='utf-8') as f:
    content = f.read()

helpers = '''
  const getStatusConfig = (status) => {
    switch (status) {
      case 'completed':
        return { label: 'Completed', color: '#10B981', bgColor: '#D1FAE5' };
      case 'started':
        return { label: 'In Progress', color: '#3B82F6', bgColor: '#DBEAFE' };
      case 'pending':
      default:
        return { label: 'Pending', color: '#64748B', bgColor: '#F1F5F9' };
    }
  };

  const formatJobTimeRange = (startTime, expectedHours = 2) => {
    if (!startTime) return '9:00 AM - 11:00 AM';
    
    const start = new Date(startTime);
    const end = new Date(start.getTime() + expectedHours * 3600 * 1000);
    
    const formatTime = (date) => {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    };

    return ${formatTime(start)} - ;
  };

  // Tab 4: Roster rendering helper
'''

if 'const getStatusConfig = ' not in content:
    content = content.replace('  // Tab 4: Roster rendering helper', helpers)

# Replace Ongoing Projects Section
ongoing_pattern = r'\{/\*\s*Ongoing Projects Section\s*\*/\}(.*?)\{/\*\s*Real-time GPS Track details inside profile\s*\*/\}'
ongoing_replacement = '''{/* Ongoing Projects Section */}
          <View style={[styles.profileSection, { marginBottom: 20 }]}>
            <Text style={[styles.profileSectionTitle, { fontSize: 14, marginBottom: 8 }]}>? Ongoing projects ({workerOngoingProjects.length}):</Text>
            {workerOngoingProjects.length === 0 ? (
              <Text style={{ color: '#64748B', fontSize: 12, paddingLeft: 8 }}>No ongoing projects assigned.</Text>
            ) : (
              workerOngoingProjects.map(c => {
                const status = getStatusConfig(c.status);
                return (
                  <View key={c._id} style={styles.jobItemRow}>
                    <View style={styles.jobItemHeader}>
                      <View style={styles.addressCol}>
                        <Text style={{ fontWeight: '800', color: Colors.secondary, fontSize: 13, marginBottom: 2 }} numberOfLines={1}>
                          {c.clientName || 'Private Customer'}
                        </Text>
                        <Text style={styles.addressText} numberOfLines={1}>?? {c.location?.address}</Text>
                        <Text style={styles.timeRangeText}>
                          ?? {new Date(c.schedule?.date).toLocaleDateString()}  ? {formatJobTimeRange(c.schedule?.date, c.schedule?.durationMinutes ? c.schedule.durationMinutes/60 : 2)}
                        </Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: status.bgColor }]}>
                        <Text style={[styles.statusBadgeText, { color: status.color }]}>{status.label}</Text>
                      </View>
                    </View>
                    <Text style={{ marginTop: 2, fontStyle: 'italic', color: '#64748B', fontSize: 12 }}>
                      Waiting for crew to finish work...
                    </Text>
                  </View>
                );
              })
            )}
          </View>

          {/* Real-time GPS Track details inside profile */}'''

content = re.sub(ongoing_pattern, ongoing_replacement, content, flags=re.DOTALL)

# Replace Paysheet Section
paysheet_pattern = r'\{/\*\s*Completed Jobs Table Header\s*\*/\}(.*?)\{/\*\s*Total Payout display card underneath\s*\*/\}'
paysheet_replacement = '''{/* Completed Jobs Table Header */}
                <View style={styles.tableHeaderRow}>
                  <Text style={[styles.tableHeaderCell, { width: '25%' }]}>Client</Text>
                  <Text style={[styles.tableHeaderCell, { width: '25%' }]}>Location</Text>
                  <Text style={[styles.tableHeaderCell, { width: '20%' }]}>Date</Text>
                  <Text style={[styles.tableHeaderCell, { width: '15%', textAlign: 'center' }]}>Hours</Text>
                  <Text style={[styles.tableHeaderCell, { width: '15%', textAlign: 'right' }]}>Payout</Text>
                </View>

                {completedJobs.length === 0 ? (
                  <Text style={styles.emptyTableText}>No completed projects covered in this period.</Text>
                ) : (
                  completedJobs.map(job => {
                    const hours = job.totalHoursWorked || 0;
                    const payout = parseFloat((hours * stats.hourlyRate).toFixed(2));
                    return (
                      <View key={job._id} style={styles.tableBodyRow}>
                        <View style={[styles.tableBodyCell, { width: '25%', flexDirection: 'column' }]}>
                          <Text numberOfLines={1} style={{ fontSize: 13, color: '#1E293B' }}>
                            {job.customerName && job.customerName.startsWith('Freelance Job:') ? job.customerName.replace('Freelance Job: ', '') : job.customerName}
                          </Text>
                          {job.customerName && job.customerName.startsWith('Freelance Job:') && (
                            <Text style={{ fontSize: 10, color: '#3B82F6', fontWeight: 'bold', marginTop: 2 }}>
                              [Freelance Contract]
                            </Text>
                          )}
                        </View>
                        <Text style={[styles.tableBodyCell, { width: '25%' }]} numberOfLines={1}>{job.address}</Text>
                        <Text style={[styles.tableBodyCell, { width: '20%' }]} numberOfLines={1}>
                          {new Date(job.startTime).toLocaleDateString(undefined, {month: 'numeric', day: 'numeric'})}
                        </Text>
                        <Text style={[styles.tableBodyCell, { width: '15%', textAlign: 'center' }]}>{hours}h</Text>
                        <Text style={[styles.tableBodyCell, { width: '15%', textAlign: 'right', fontWeight: '800', color: '#059669' }]}>
                          
                        </Text>
                      </View>
                    );
                  })
                )}

                {/* Total Payout display card underneath */}'''

content = re.sub(paysheet_pattern, paysheet_replacement, content, flags=re.DOTALL)

with open('frontend/src/screens/contractor/ContractorDashboard.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated successfully")
