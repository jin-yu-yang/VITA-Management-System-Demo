# Tax Help Intake Form: Question Design (for Online Form, General Version)

> Source: IRS Form 13614-C (Rev. 10-2025) + Form 15080 (Rev. 10-2025)
> Tax year: **2025**
> Every question includes: English wording, Chinese wording, field ID, input type, and display conditions.
> Content is kept in sync with the senior version; only the wording is more standard.

---

## Design Conventions (for developers)

- **Language level**: Clear, standard wording. Explain tax terms briefly in a Tip when needed.
- **One question per screen or per group**: Don't stack too much on one page.
- **Terms used in Chinese**: "IRS" is written as "国税局（IRS）" the first time on each page, then "国税局". "Spouse" is always "配偶".
- **"Who" multi-select questions**: Many questions ask "you or your spouse". The standard options are:
  - `me` (Me / 本人)
  - `spouse` (My spouse / 配偶), **shown only when married**
  - `none` (No one / 均无), which clears the other two when selected
- **Every Yes/No question** has an extra option: `not_sure` (I'm not sure / 不确定). The volunteer will confirm it in person.
- **Show if** = the question appears only when the condition is met.
- **Upload**: When a Tip says "upload", show a file-upload button right under that question.
- Fields on the paper form marked "To be completed by certified volunteer" **do not appear on the public-facing form** (see the appendix).

---

## Section 0: Before You Start / 开始之前

**Page text (no input required):**

> Please have these ready:
> - Tax forms you received, such as **W-2**, **1099**, **1098**, **1095**
> - **Social Security card** or **ITIN letter** for everyone on your tax return
> - **Photo ID** (such as a driver's license) for you and your spouse
>
> You are responsible for the information on your tax return. Please provide complete and accurate information.
> If you are unsure about a question, choose "I'm not sure." A volunteer will follow up.
>
> 请提前准备：
> - 收到的税表，如 W-2、1099、1098、1095
> - 报税表上所有人的社会安全卡或 ITIN 信
> - 您和配偶的带照片身份证件（如驾照）
>
> 您需对报税表上的信息负责，请完整、准确地填写。如对某个问题不确定，请选择"不确定"，志愿者会跟进确认。

To report unethical behavior by a volunteer: ts.voltax@irs.gov / 如需举报志愿者的不当行为，请发送邮件至 ts.voltax@irs.gov

---

## Section 1: About You / 个人信息

**Q1.1** First name / 名
`tp_first_name` · Text · Required
> Tip: As shown on your Social Security card. / 请与社会安全卡上的拼写一致。

**Q1.2** Middle name / 中间名
`tp_middle_name` · Text · Optional
> Tip: Leave blank if you don't have one. / 如没有可留空。

**Q1.3** Last name / 姓
`tp_last_name` · Text · Required
> Tip: As shown on your Social Security card. / 请与社会安全卡上的拼写一致。

**Q1.4** Date of birth / 出生日期
`tp_dob` · Date (MM/DD/YYYY) · Required

**Q1.5** Occupation / 职业
`tp_job_title` · Text · Required
> Tip: For example: cook, cashier, driver, student, retired, unemployed. / 例如：厨师、收银员、司机、学生、退休、无业。

**Q1.6** Phone number / 电话号码
`tp_phone` · Phone · Required

**Q1.7** Email (optional) / 电子邮箱（选填）
`email` · Email · Optional

---

## Section 2: Mailing Address / 邮寄地址

**Q2.1** Street address / 街道地址
`addr_street` · Text · Required
> Tip: The address where you receive mail. IRS letters will be sent here. / 请填写您的收信地址，国税局（IRS）的信件会寄到此地址。

**Q2.2** Apartment number / 公寓号
`addr_apt` · Text · Optional

**Q2.3** City / 城市
`addr_city` · Text · Required

**Q2.4** State / 州
`addr_state` · Dropdown (US states) · Required

**Q2.5** ZIP code / 邮编
`addr_zip` · Text (5 digits) · Required

---

## Section 3: Marital Status / 婚姻状况

**Q3.1** As of December 31, 2025, what was your marital status? / 截至 2025 年 12 月 31 日，您的婚姻状况是？
`marital_status` · Single choice · Required
- `never_married`: Never married / 未婚
- `married`: Married / 已婚
- `divorced`: Divorced / 离婚
- `separated`: Legally separated, but not divorced / 法定分居（未离婚）
- `widowed`: Widowed / 丧偶

> Tip: "Legally separated" means you have a court-issued separation decree. Simply living apart does not count. / "法定分居"指法院已出具分居判决，仅分开居住不算。

**Q3.2** Were you married on the last day of 2025 (December 31)? / 2025 年最后一天（12 月 31 日），您是否仍处于已婚状态？
`married_last_day` · Yes / No · **Show if** `marital_status = married`

**Q3.3** Did you and your spouse live apart for all of the last 6 months of 2025 (July 1 – December 31)? / 2025 年最后 6 个月（7 月 1 日至 12 月 31 日），您和配偶是否一直分开居住？
`lived_apart_last_6mo` · Yes / No · **Show if** `marital_status = married`

**Q3.4** Date of final divorce decree / 离婚判决生效日期
`divorce_date` · Date · **Show if** `marital_status = divorced`
> Tip: Found on your divorce decree. / 见法院离婚判决书。

**Q3.5** Date of separate maintenance decree / 法定分居判决日期
`separation_date` · Date · **Show if** `marital_status = separated`
> Tip: Found on your court separation papers. / 见法院分居判决文件。

**Q3.6** Year of spouse's death / 配偶去世年份
`spouse_death_year` · Year · **Show if** `marital_status = widowed`

---

## Section 4: Spouse Information / 配偶信息

> **Show this whole section if** `marital_status = married`

**Q4.1** Spouse's first name / 配偶的名
`sp_first_name` · Text · Required
> Tip: As shown on their Social Security card. / 请与社会安全卡上的拼写一致。

**Q4.2** Spouse's middle name / 配偶的中间名
`sp_middle_name` · Text · Optional
> Tip: Leave blank if your spouse doesn't have one. / 如没有可留空。

**Q4.3** Spouse's last name / 配偶的姓
`sp_last_name` · Text · Required

**Q4.4** Spouse's date of birth / 配偶出生日期
`sp_dob` · Date (MM/DD/YYYY) · Required

**Q4.5** Spouse's occupation / 配偶职业
`sp_job_title` · Text · Required
> Tip: For example: cook, cashier, driver, student, retired, unemployed. / 例如：厨师、收银员、司机、学生、退休、无业。

**Q4.6** Spouse's phone number / 配偶电话号码
`sp_phone` · Phone · Optional

---

## Section 5: Your Situation in 2025 / 2025 年基本情况

> Use the "Who" multi-select (Me / My spouse / No one) for Q5.3–Q5.9.

**Q5.1** Did you live or work in two or more states in 2025? / 2025 年，您是否在两个或以上的州居住或工作过？
`multi_state` · Yes / No / Not sure
> Tip: For example, you live in New York but work in New Jersey. / 例如：住在纽约州，在新泽西州工作。

**Q5.2** Can anyone else (such as a parent or adult child) claim you or your spouse as a dependent on their tax return? / 是否有其他人（如父母或成年子女）可以在其报税表上将您或配偶列为受抚养人？
`claimed_by_other` · Yes / No / Not sure
> Tip: Common for students still supported by their parents. / 常见于仍由父母供养的学生。

**Q5.3** Who is a U.S. citizen? / 以下谁是美国公民？
`us_citizen` · Who (multi-select)

**Q5.4** Who was in the U.S. on a visa in 2025? / 2025 年，以下谁持签证在美国？
`on_visa` · Who (multi-select)
> Tip: For example, a student or work visa. A green card is **not** a visa. / 例如学生签证、工作签证。**绿卡不属于签证。**

**Q5.5** Who was a full-time student in 2025? / 2025 年，以下谁是全日制学生？
`fulltime_student` · Who (multi-select)
> Tip: Enrolled full-time, as defined by the school, for at least 5 months of the year. / 指全年至少有 5 个月被学校认定为全日制在读。

**Q5.6** Who is legally blind? / 以下谁属于法定失明？
`legally_blind` · Who (multi-select)
> Tip: Certified by a doctor; vision cannot be adequately corrected with glasses. / 需有医生证明，戴眼镜也无法充分矫正视力。

**Q5.7** Who is totally and permanently disabled? / 以下谁属于完全且永久性残疾？
`disabled` · Who (multi-select)
> Tip: Certified by a doctor as unable to work due to a condition expected to last at least 1 year or be permanent. / 需有医生证明，因健康原因无法工作，且预计持续至少 1 年或永久。

**Q5.8** Who was issued an Identity Protection PIN (IP PIN)? / 以下谁持有国税局（IRS）发放的身份保护码（IP PIN）？
`ippin` · Who (multi-select)
> Tip: A 6-digit number from the IRS, issued after identity theft or through voluntary sign-up. A new one is issued every year. If you have one, upload this year's letter. / 国税局发放的 6 位数字，通常在身份被盗用后发放，也可自行申请，**每年更换**。如有，请上传今年的通知信。

**Q5.9** Who owned or held any digital assets (such as Bitcoin, Ethereum, or other cryptocurrency) in 2025? / 2025 年，以下谁拥有或持有数字资产（如比特币、以太坊等加密货币）？
`digital_assets` · Who (multi-select)

---

## Section 6: Household Members and Dependents / 家庭成员及受抚养人

**Intro text:**
> List **everyone who lived with you in 2025** (except your spouse), and **anyone you financially supported** who did not live with you.
> 请列出 2025 年与您同住的所有人（配偶除外），以及未与您同住但由您提供经济支持的人。

**Q6.0** Did anyone live with you or receive financial support from you in 2025? / 2025 年，是否有人与您同住或由您提供经济支持？
`has_household_members` · Yes / No

> **Show if** `has_household_members = yes`: Repeatable group "Add a person / 添加成员" (the paper form has 4 rows; the online form can allow more).

For each person:

**Q6.1** First name / 名
`hh[i].first_name` · Text · Required

**Q6.1b** Last name / 姓
`hh[i].last_name` · Text · Required
> Dev note: Keep first and last name as separate fields to avoid order mix-ups.

**Q6.2** Date of birth / 出生日期
`hh[i].dob` · Date (MM/DD/YYYY) · Required

**Q6.3** Relationship to you / 与您的关系
`hh[i].relationship` · Dropdown · Required
- Son / Daughter (子女), Stepchild (继子女), Foster child (寄养子女), Grandchild (孙子女/外孙子女), Brother / Sister (兄弟姐妹), Niece / Nephew (侄子女/外甥子女), Parent (父母), Grandparent (祖父母/外祖父母), Other relative (其他亲属), None (无亲属关系)

**Q6.4** Number of months lived in your home in 2025 / 2025 年在您家居住的月数
`hh[i].months_lived` · Number 0–12 · Required
> Tip: If born in 2025 and lived with you since birth, enter 12. / 如 2025 年出生且出生后一直与您同住，请填 12。

**Q6.5** Marital status as of December 31, 2025 / 截至 2025 年 12 月 31 日的婚姻状况
`hh[i].married` · Married (已婚) / Single (未婚)

**Q6.6** U.S. citizen? / 是否为美国公民？
`hh[i].us_citizen` · Yes / No / Not sure

**Q6.7** In 2025, was this person a resident of the U.S., Canada, or Mexico? / 2025 年，此人是否居住在美国、加拿大或墨西哥？
`hh[i].resident_na` · Yes / No / Not sure

**Q6.8** Full-time student in 2025 (at least 5 months)? / 2025 年是否为全日制学生（至少 5 个月）？
`hh[i].fulltime_student` · Yes / No / Not sure

**Q6.9** Totally and permanently disabled? / 是否为完全且永久性残疾？
`hh[i].disabled` · Yes / No / Not sure

**Q6.10** Issued an IP PIN? / 是否持有身份保护码（IP PIN）？
`hh[i].ippin` · Yes / No / Not sure
> Tip: If yes, upload this year's letter. / 如有，请上传今年的通知信。

---

## Section 7: Refund and Payment / 退税与补税

**Q7.1** If you are due a refund, how would you like to receive it? / 如有退税，您希望以何种方式收取？
`refund_method` · Single choice
- `direct_deposit`: Direct deposit / 直接存入银行账户（最快）
- `check`: Check by mail / 邮寄支票
- `split`: Split between accounts / 分存多个账户
- `other`: Other / 其他

> Tip (show if `direct_deposit` or `split`): Have your bank routing and account numbers ready. / 请准备好银行路由号码和账户号码。

**Q7.1a** Please specify / 请说明
`refund_method_other` · Text · **Show if** `refund_method = other`

**Q7.2** If you have a balance due, how would you like to pay? / 如需补税，您希望以何种方式付款？
`payment_method` · Single choice
- `bank_account`: Bank account (direct debit) / 从银行账户扣款
- `direct_pay`: IRS.gov Direct Pay / 通过国税局网站（IRS.gov Direct Pay）自行付款
- `installment`: Installment agreement / 申请分期付款
- `mail`: Mail payment to the IRS / 邮寄付款给国税局

---

## Section 8: Language and Election Fund / 语言偏好与总统选举基金

**Q8.1** Would you like written communications from the IRS in a language other than English? / 您是否希望国税局用英语以外的语言与您书面沟通？
`irs_language_pref` · Who (multi-select)

**Q8.2** Which language? / 哪种语言？
`irs_language` · Dropdown / Text · **Show if** `irs_language_pref ≠ none`

**Q8.3** Would you like $3 to go to the Presidential Election Campaign Fund? / 您是否愿意将 3 美元拨入总统选举竞选基金？
`pecf` · Who (multi-select)
> Tip: **This does not increase your tax or reduce your refund.** / **不会增加您的税款，也不会减少您的退税。**

---

## Section 9: Income in 2025 / 2025 年收入

**Intro text:**
> Did **you or your spouse** receive any of the following in 2025? If yes, please upload the related tax forms.
> 2025 年，您或配偶是否有以下收入？如有，请上传相关税表。

> Each item below is Yes / No / Not sure. Some items have follow-up questions.

**Q9.1** Wages from a part-time or full-time job / 工资（兼职或全职）
`inc_wages`
> Tip: Reported on Form **W-2**. / 对应 **W-2** 表。

**Q9.1a** How many jobs did you and your spouse have in 2025? / 2025 年您和配偶共有几份工作？
`inc_wages_job_count` · Number · **Show if** `inc_wages = yes`
> Tip: Usually one W-2 per job. / 通常一份工作对应一张 W-2。

**Q9.2** Tips / 小费
`inc_tips`
> Tip: All tips, including cash tips, are income. Some tips may be deductible starting in 2025; please have your tip records ready. / 所有小费（含现金小费）均需申报。自 2025 年起部分小费可能可以扣除，请准备好小费记录，志愿者会协助判断。

**Q9.3** Retirement account, pension, or annuity distributions / 退休账户、养老金或年金收入
`inc_retirement`
> Tip: Such as a 401(k) or IRA. Reported on Form **1099-R**. / 如 401(k)、IRA，对应 **1099-R** 表。

**Q9.4** Disability benefits (from insurance or workers' compensation) / 残障补助（保险或工伤赔偿）
`inc_disability`

**Q9.5** Social Security or Railroad Retirement benefits / 社会安全金或铁路退休金
`inc_social_security`
> Tip: Reported on Form **SSA-1099** or **RRB-1099**. / 对应 **SSA-1099** 或 **RRB-1099** 表。

**Q9.6** Unemployment benefits / 失业金
`inc_unemployment`
> Tip: Reported on Form **1099-G**. / 对应 **1099-G** 表。

**Q9.7** Refund of state or local income tax / 州或地方所得税退税
`inc_state_refund`

**Q9.8** Interest or dividends (bank accounts, bonds, stocks, etc.) / 利息或股息（银行账户、债券、股票等）
`inc_interest_div`
> Tip: Reported on Form **1099-INT** or **1099-DIV**. / 对应 **1099-INT** 或 **1099-DIV** 表。

**Q9.9** Sale of stocks, bonds, or real estate / 出售股票、债券或房地产
`inc_sale_assets`
> Tip: Reported on Form **1099-B**. Please also upload your brokerage statement. / 对应 **1099-B** 表，请同时上传券商对账单。

**Q9.9a** Did you report a loss from these sales on last year's return? / 去年的报税表是否申报过此类亏损？
`inc_sale_assets_prior_loss` · Yes / No / Not sure · **Show if** `inc_sale_assets = yes`

**Q9.10** Alimony received (not child support) / 收到的赡养费（不含子女抚养费）
`inc_alimony`

**Q9.11** Income from renting out your house or a room in your house / 出租房屋或房间的收入
`inc_rental_home`

**Q9.11a** Did you also use it as your home AND rent it out for fewer than 15 days in 2025? / 该房屋是否同时为您的自住房，且 2025 年出租不足 15 天？
`inc_rental_home_under15` · Yes / No / Not sure · **Show if** `inc_rental_home = yes`

**Q9.12** Income from renting out personal property (such as a vehicle or tools) / 出租个人物品（如车辆、工具）的收入
`inc_rental_property`

**Q9.13** Gambling or lottery winnings / 赌博或彩票奖金
`inc_gambling`
> Tip: May be reported on Form **W-2G**. / 可能对应 **W-2G** 表。

**Q9.14** Income from contract or self-employment work / 合同工或自雇收入
`inc_self_employed`
> Tip: For example: delivery or rideshare apps, cleaning, selling goods. May be reported on Form **1099-NEC**, **1099-MISC**, or **1099-K**. / 例如：外卖或网约车平台、清洁服务、销售商品。可能对应 **1099-NEC**、**1099-MISC** 或 **1099-K** 表。

**Q9.14a** Did you report a loss from this work on last year's return? / 去年的报税表是否申报过此项亏损？
`inc_self_employed_prior_loss` · Yes / No / Not sure · **Show if** `inc_self_employed = yes`

**Q9.15** Any other income? (Cash payments, jury duty, prizes or awards, digital assets, royalties, union strike benefits, etc.) / 其他收入？（如现金收入、陪审员报酬、奖品或奖励、数字资产、版税、工会罢工补助等）
`inc_other`

**Q9.15a** Please describe / 请说明收入类型
`inc_other_desc` · Text · **Show if** `inc_other = yes`

---

## Section 10: Expenses in 2025 / 2025 年支出

### Part A: Itemized Deduction Expenses / 可分项扣除的支出

> Each item is Yes / No / Not sure.

**Q10.1** Mortgage interest / 房贷利息
`exp_mortgage_interest`
> Tip: Reported on Form **1098**. / 对应 **1098** 表。

**Q10.2** Taxes paid: state, local, real estate, sales, etc. / 已缴税款：州税、地方税、房产税、销售税等
`exp_taxes`

**Q10.3** Medical, dental, or prescription expenses / 医疗、牙科或处方药费用
`exp_medical`

**Q10.4** Charitable contributions / 慈善捐款
`exp_charity`

### Part B: Other Expenses / 其他支出

**Q10.5** Student loan interest / 学生贷款利息
`exp_student_loan`
> Tip: Reported on Form **1098-E**. / 对应 **1098-E** 表。

**Q10.6** Child and dependent care (so you could work) / 为工作而支付的子女或受抚养人照护费用
`exp_dependent_care`
> Tip: Have the provider's name, address, and tax ID number ready. / 请准备好照护机构或人员的名称、地址和税号。

**Q10.7** Contributions to a retirement account (IRA, 401(k), etc.) / 退休账户供款（IRA、401(k) 等）
`exp_retirement_contrib`

**Q10.8** Classroom supplies purchased as a teacher, teacher's aide, or other educator / 教师、助教或其他教育工作者自费购买的教学用品
`exp_educator`

**Q10.9** Alimony paid (not child support) / 支付的赡养费（不含子女抚养费）
`exp_alimony_paid`
> Tip: Have your former spouse's Social Security number ready. / 请准备好前配偶的社会安全号码。

---

## Section 11: Tax-Related Events in 2025 / 2025 年税务相关事项

> Each item is Yes / No / Not sure.

**Q11.1** You or a family member took classes (college, trade school, job-related training, etc.) / 您或家人参加过课程（大学、职业学校、职业培训等）
`evt_education`
> Tip: Upload Form **1098-T** and payment receipts. / 请上传 **1098-T** 表及缴费收据。

**Q11.2** Sold a home / 出售房屋
`evt_sold_home`

**Q11.3** Had a Health Savings Account (HSA) / 持有健康储蓄账户（HSA）
`evt_hsa`

**Q11.4** Purchased health insurance through the Marketplace (HealthCare.gov or a state exchange) / 通过医保交易市场（HealthCare.gov 或州交易平台）购买医疗保险
`evt_marketplace`
> Tip: Upload every Form **1095-A** you received. Medicaid and Medicare do not count. / 请上传收到的所有 **1095-A** 表。Medicaid 和 Medicare 不属于此类。

**Q11.5** Purchased and installed energy-efficient home improvements (windows, furnace, insulation, etc.) / 购买并安装节能家居改造（窗户、暖气炉、隔热材料等）
`evt_energy`

**Q11.6** Other (for example: purchased a new vehicle) / 其他（例如购买新车）
`evt_other`

**Q11.6a** Please describe / 请说明
`evt_other_desc` · Text · **Show if** `evt_other = yes`
> Tip: If you bought a new vehicle with a loan, provide the 17-character VIN (on the purchase contract or registration). / 如贷款购买新车，请提供 17 位车辆识别号（VIN），可在购车合同或车辆登记证上找到。

**Q11.7** Had credit card, mortgage, or other debt canceled or forgiven by a lender / 信用卡、房贷或其他债务被贷款方取消或免除
`evt_debt_canceled`
> Tip: May be reported on Form **1099-C** or **1099-A**. / 可能对应 **1099-C** 或 **1099-A** 表。

**Q11.8** Had a loss in a federally declared disaster area / 在联邦宣布的灾区遭受损失
`evt_disaster`

**Q11.9** Had a tax credit disallowed in a prior year (e.g., EITC, Child Tax Credit, American Opportunity Credit) / 以往年度是否有税收抵免被拒（如劳动所得抵免 EITC、儿童税收抵免 CTC、美国机会教育抵免 AOTC）
`evt_credit_disallowed`

**Q11.10** Received any letter or bill from the IRS / 收到国税局的信件或账单
`evt_irs_letter`
> Tip: Please upload the letter. / 请上传该信件。

**Q11.11** Made estimated tax payments or applied last year's refund to 2025 taxes / 缴纳过预估税，或将去年的退税用于抵缴 2025 年税款
`evt_estimated_payments`

**Q11.12** Can you upload last year's tax return? / 能否上传去年的报税表？
`evt_brought_prior_return` · Yes / No

---

## Section 12: Optional Questions (for statistics only) / 选填问题（仅用于统计）

**Page text:**
> These questions are **optional**. Your answers are **not** part of your tax return and are **not** sent to the IRS.
> 以下问题为**选填**。您的回答**不属于**报税表内容，也**不会**提交给国税局。

**Q12.1** How well can you carry on a conversation in English? / 您用英语交谈的能力如何？
`opt_english_speak` · Single choice: Very well (很好) / Well (较好) / Not well (不太好) / Not at all (完全不会) / Prefer not to answer (不愿回答)

**Q12.2** How well can you read a newspaper in English? / 您阅读英文报纸的能力如何？
`opt_english_read` · Single choice: Very well (很好) / Well (较好) / Not well (不太好) / Not at all (完全不会) / Prefer not to answer (不愿回答)

**Q12.3** Do you or any member of your household have a disability? / 您或家庭成员中是否有人有残疾？
`opt_household_disability` · Yes (是) / No (否) / Prefer not to answer (不愿回答)

**Q12.4** Are you or your spouse a veteran of the U.S. Armed Forces? / 您或配偶是否为美国退伍军人？
`opt_veteran` · Yes (是) / No (否) / Prefer not to answer (不愿回答)

**Q12.5** What is your race and/or ethnicity? (Select all that apply) / 您的种族和/或族裔？（可多选）
`opt_race_tp` · Multi-select
- American Indian or Alaska Native / 美洲原住民或阿拉斯加原住民
- Asian / 亚裔
- Black or African American / 黑人或非裔美国人
- Hispanic or Latino / 西班牙裔或拉丁裔
- Middle Eastern or North African / 中东或北非裔
- Native Hawaiian or Pacific Islander / 夏威夷原住民或太平洋岛民
- White / 白人
- Prefer not to answer / 不愿回答 *(added for online form)*

> Dev note: Show the examples from the paper form (e.g., "Chinese, Filipino, Vietnamese…") as small gray text under each option.

**Q12.6** What is your spouse's race and/or ethnicity? (Select all that apply) / 配偶的种族和/或族裔？（可多选）
`opt_race_sp` · Multi-select (same options as Q12.5) · **Show if** `marital_status = married`

**Privacy notice:** Show the full "Privacy Act and Paperwork Reduction Act Notice" from page 4 of the paper form in a collapsible box, titled "How we use your information / 我们如何使用您的信息".

---

## Section 13: Additional Notes / 补充说明

**Q13.1** Anything else you'd like the volunteer to know? / 还有其他需要告知志愿者的信息吗？
`additional_notes` · Long text · Optional

---

## Section 14: Consent to Disclose Tax Return Information (Form 15080) / 报税信息披露同意书

**Page text (summary):**
> **This consent is optional. Declining will not affect the tax preparation service you receive.**
> **此同意书为自愿签署。不同意不会影响我们为您提供报税服务。**
>
> If you consent, TaxSlayer (the VITA/TCE software provider) may make your tax return information available to **any** VITA/TCE site using TaxSlayer that you visit next filing season, so your return can be pre-filled.
> 如您同意，TaxSlayer（VITA/TCE 报税软件提供商）可将您的报税信息提供给您明年前往的**任何**使用 TaxSlayer 的 VITA/TCE 报税点，用于自动预填。
>
> Information disclosed includes: name, address, date of birth, phone, SSN, filing status, occupation, employer, income, deductions, and credits, plus your dependents' names, SSNs, dates of birth, and relationship to you.
> 披露的信息包括：姓名、地址、出生日期、电话、社会安全号码、报税身份、职业、雇主、收入、扣除项和抵免项，以及受抚养人的姓名、社会安全号码、出生日期和与您的关系。
>
> This consent is valid through **November 30, 2027**.
> 本同意有效期至 **2027 年 11 月 30 日**。
>
> **Note:** Once disclosed, federal law may not protect your information from further use or distribution.
> **注意：**信息披露后，联邦法律可能无法防止其被进一步使用或传播。
>
> Consent is not needed for the site preparing your return this year; it only helps if you visit a **different** site next year.
> 今年为您报税的站点无需此同意；仅在您明年前往**其他**站点时有用。
>
> You have the right to receive a signed copy of this form.
> 您有权获得本表签署后的副本。

Show the full original Form 15080 text in a collapsible box: "Read the full legal text / 阅读完整法律条款".

**Q14.1** Do you consent to this disclosure? / 您是否同意上述信息披露？
`gcf_consent` · Single choice · Required
- `yes`: I consent / 同意
- `no`: I do not consent / 不同意

> Tip: If you wish to limit the duration or scope of the disclosure, choose **No**. / 如希望缩短有效期或限制披露范围，请选择**不同意**。

**Q14.2** Primary taxpayer signature (type full name) / 主报税人签名（输入全名）
`gcf_tp_signature` · Text (e-signature) · **Show if** `gcf_consent = yes`

**Q14.3** Date / 日期
`gcf_tp_date` · Date (auto-fill today) · **Show if** `gcf_consent = yes`

**Q14.4** Secondary taxpayer (spouse) signature (type full name) / 配偶签名（输入全名）
`gcf_sp_signature` · Text (e-signature) · **Show if** `gcf_consent = yes` AND `marital_status = married`

**Q14.5** Spouse signature date / 配偶签名日期
`gcf_sp_date` · Date (auto-fill today) · **Show if** `gcf_sp_signature` is filled

**Footer text:**
> If you believe your tax return information has been disclosed or used improperly, contact TIGTA at **1-800-366-4484** or https://www.tigta.gov/reportcrime-misconduct
> 如您认为您的报税信息被不当披露或使用，请联系 TIGTA：**1-800-366-4484**，或访问上述网址。

---

## Appendix A: Volunteer-Only Fields (NOT shown on public form)

These are on the right side of the paper form, "To be completed by certified volunteer". Put them in the **volunteer back office**, not the taxpayer form.

| Paper form area | Volunteer fields |
|---|---|
| Page 1 household table | Qualifying child/relative of any other person; person provided >50% of own support; person had <$5,200 income; taxpayer provided >50% of support; taxpayer paid >half the cost of maintaining a home |
| Page 2 income | Counts of W-2, 1099-R, SSA-1099, 1099-G, 1099-INT, 1099-DIV, 1099-B, W-2G, 1099-MISC/NEC/K; QCD amount; state refund amount; itemized last year; capital loss carryover; alimony amount & excluded; rental expense; Schedule C expenses; other income; notes |
| Page 3 deductions | 1098 count; standard vs. itemized; 1098-E; child care credit; IRA; educator expense amount; alimony paid with spouse SSN; adjustment to income; notes |
| Page 3 events | Taxable scholarship; 1098-T; education credit; 1099-S; HSA contributions/distributions; 1095-A; Form 5695 Part II; VIN; 1099-C; 1099-A; disaster relief; credit disallowed year & reason; LITC referral; estimated payments; prior-year refund applied; prior-year return available; notes |

## Appendix B: Field ID Mapping to Paper Form

| Section | Paper form location |
|---|---|
| 1–4 | Form 13614-C p.1, top (personal info, address, marital status) |
| 5 | p.1, "Check if you or your spouse were in 2025" + two-states + claimed by others |
| 6 | p.1, household member table (taxpayer-answered columns only) |
| 7–8 | p.1, refund/payment, language, Presidential Election Campaign Fund |
| 9 | p.2, left side (Income) |
| 10–11 | p.3, left side (Expenses and Tax Related Events) |
| 12 | p.4 (Optional Information) |
| 13 | p.5 (Additional Notes) |
| 14 | Form 15080 (Global Carry Forward consent) |
