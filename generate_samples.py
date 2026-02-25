import os
from fpdf import FPDF

samples_dir = '/Users/maverickrajeev/Documents/projects/clear-clause/frontend/public/samples'
os.makedirs(samples_dir, exist_ok=True)

docs = {
    'airbnb_tos.pdf': 'Airbnb Terms of Service\n\n1. Acceptance of Terms\nBy using the Airbnb platform, you agree to these terms.\n2. User Responsibilities\nYou are responsible for your account and any activity on it.\n\nArbitration Clause: You agree to resolve any disputes by binding arbitration and waive rights to a class action lawsuit.',
    'sample_lease.pdf': 'Residential Lease Agreement\n\n1. Parties\nThis lease is between the Landlord and the Tenant.\n2. Rent\nRent is due on the 1st of each month.\n\nLate Fees: Failure to pay rent on time will result in a late fee of 15% of the total rent amount.\nSubletting: Tenant shall not assign or sublet the premises without written consent.',
    'nda_template.pdf': 'Non-Disclosure Agreement\n\n1. Confidential Information\nConfidential information includes all trade secrets, business plans, and financial information.\n2. Obligations\nReceiving party shall not disclose information to third parties.\n\nTerm: The obligations of confidentiality shall continue indefinitely after the termination of this agreement.'
}

for filename, text in docs.items():
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Arial", size=12)
    pdf.multi_cell(0, 10, txt=text)
    out_path = os.path.join(samples_dir, filename)
    pdf.output(out_path)
    print(f"Generated {out_path}")
